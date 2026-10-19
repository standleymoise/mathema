import mysql from 'mysql2/promise'
import { SCHEMA, SEED_PLANS, SEED_PRICES, DEFAULT_SETTINGS } from './schema.mjs'
import { hashPassword } from './crypto.mjs'

export function createPool(db) {
  return mysql.createPool({ ...db, waitForConnections: true, connectionLimit: 8, timezone: 'Z', charset: 'utf8mb4', dateStrings: false, decimalNumbers: true })
}

export async function migrate(pool, cfg) {
  for (const sql of SCHEMA) await pool.query(sql)
  for (const [id, name, price, unit, quota, active] of SEED_PLANS)
    await pool.query('INSERT IGNORE INTO plans (id,name,price_cents,interval_unit,ai_monthly_quota,active) VALUES (?,?,?,?,?,?)', [id, name, price, unit, quota, active])
  for (const [provider, model, label, i, o] of SEED_PRICES)
    await pool.query('INSERT IGNORE INTO model_prices (provider,model,label,input_per_mtok,output_per_mtok,enabled) VALUES (?,?,?,?,?,1)', [provider, model, label, i, o])
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS))
    await pool.query('INSERT IGNORE INTO settings (k,v) VALUES (?,?)', [k, JSON.stringify(v)])
  // Bootstrap the first admin from env. Never overwrites an existing password.
  if (cfg.adminEmail && cfg.adminPassword) {
    const [rows] = await pool.query('SELECT id, role FROM users WHERE email=?', [cfg.adminEmail])
    if (!rows.length) {
      await pool.query('INSERT INTO users (email,name,pass_hash,role,plan_id,created_at) VALUES (?,?,?,?,?,?)', [cfg.adminEmail, 'Admin', await hashPassword(cfg.adminPassword), 'admin', 'free', new Date()])
    } else if (rows[0].role !== 'admin') await pool.query("UPDATE users SET role='admin' WHERE id=?", [rows[0].id])
  }
  await pool.query('DELETE FROM sessions WHERE expires_at < ?', [new Date()])
}

export async function getSetting(pool, k) {
  const [rows] = await pool.query('SELECT v FROM settings WHERE k=?', [k])
  if (!rows.length) return DEFAULT_SETTINGS[k]
  try { return JSON.parse(rows[0].v) } catch { return DEFAULT_SETTINGS[k] }
}
export const setSetting = (pool, k, v) => pool.query('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [k, JSON.stringify(v)])
export const audit = (pool, userId, action, detail = '') => pool.query('INSERT INTO audit_log (user_id,action,detail,created_at) VALUES (?,?,?,?)', [userId ?? null, action, String(detail).slice(0, 500), new Date()])
