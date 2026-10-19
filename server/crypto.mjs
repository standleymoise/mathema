import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scrypt = promisify(_scrypt)

const keyFrom = (secret) => createHash('sha256').update(`mathema:keys:${secret}`).digest()

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). Used for provider API keys at rest. */
export function encrypt(plain, secret) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyFrom(secret), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}
export function decrypt(blob, secret) {
  const buf = Buffer.from(blob, 'base64')
  const d = createDecipheriv('aes-256-gcm', keyFrom(secret), buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
}

/** scrypt password hashing (built into Node: no native dependency to compile on shared hosting). */
export async function hashPassword(pw) {
  const salt = randomBytes(16)
  const dk = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('base64')}$${dk.toString('base64')}`
}
export async function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$')
  if (alg !== 'scrypt' || !s || !h) return false
  const dk = await scrypt(pw, Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 })
  const want = Buffer.from(h, 'base64')
  return dk.length === want.length && timingSafeEqual(dk, want)
}

export const newToken = () => randomBytes(32).toString('base64url')
export const sha256 = (s) => createHash('sha256').update(s).digest('hex')
