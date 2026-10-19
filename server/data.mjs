import { Router } from 'express'
import { requireUser } from './auth.mjs'
import { featuresFor } from './features.mjs'

/** One JSON document per user with optimistic concurrency (version). Models live inside it. */
export function dataRoutes(pool) {
  const r = Router()
  r.get('/data', requireUser, async (req, res) => {
    const [rows] = await pool.query('SELECT data, version, updated_at FROM user_data WHERE user_id=?', [req.user.id])
    if (!rows.length) return res.json({ version: 0, data: null })
    res.json({ version: rows[0].version, updatedAt: rows[0].updated_at, data: JSON.parse(rows[0].data) })
  })
  r.put('/data', requireUser, async (req, res) => {
    const { data, version } = req.body ?? {}
    if (!data || typeof data !== 'object' || data.schema !== 1 || !Array.isArray(data.models)) return res.status(400).json({ error: 'invalid_data' })
    const json = JSON.stringify(data)
    if (json.length > 5_000_000) return res.status(413).json({ error: 'too_large' })
    const f = await featuresFor(pool, req.user)
    if (!f.cloudSync) return res.status(403).json({ error: 'feature_not_in_plan', feature: 'cloudSync', detail: 'Cloud sync is not included in your plan' })
    const own = data.models.filter((m) => m && m.isDemo !== true).length // the built-in demo models never count
    if (f.maxModels !== null && own > f.maxModels) return res.status(403).json({ error: 'model_limit', limit: f.maxModels, count: own, detail: `Your plan stores up to ${f.maxModels} models; you have ${own}` })
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query('SELECT version FROM user_data WHERE user_id=? FOR UPDATE', [req.user.id])
      const current = rows.length ? rows[0].version : 0
      if (Number(version ?? 0) !== current) {
        await conn.rollback()
        const [cur] = await pool.query('SELECT data FROM user_data WHERE user_id=?', [req.user.id])
        return res.status(409).json({ error: 'version_conflict', version: current, data: cur.length ? JSON.parse(cur[0].data) : null })
      }
      if (rows.length) await conn.query('UPDATE user_data SET data=?, version=version+1, updated_at=? WHERE user_id=?', [json, new Date(), req.user.id])
      else await conn.query('INSERT INTO user_data (user_id,data,version,updated_at) VALUES (?,?,?,?)', [req.user.id, json, 1, new Date()])
      await conn.commit()
      res.json({ version: current + 1 })
    } catch (e) { await conn.rollback(); throw e } finally { conn.release() }
  })
  return r
}
