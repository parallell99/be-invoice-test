import { Router } from 'express'
import { query } from '../db.js'
import {
  clearSessionCookie,
  readSessionUserId,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  signToken,
} from '../middleware/auth.js'
import { hashPassword, verifyStoredPassword } from '../lib/password.js'

const r = Router()

r.post('/register', async (req, res) => {
  const user_name = req.body?.user_name?.trim()
  const password = req.body?.password
  if (!user_name || !password) {
    return res.status(400).json({ error: 'user_name and password required' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password min 6 characters' })
  }
  try {
    const hash = await hashPassword(password)
    const { rows } = await query(
      `INSERT INTO users (user_name, password_hash)
       VALUES ($1, $2)
       RETURNING id, user_name, created_at`,
      [user_name, hash],
    )
    const user = rows[0]
    const token = signToken(user.id)
    setSessionCookie(res, token)
    return res.status(201).json({ user })
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'user_name already exists' })
    }
    console.error(e)
    return res.status(500).json({ error: 'server error' })
  }
})

r.post('/login', async (req, res) => {
  const user_name = req.body?.user_name?.trim()
  const password = req.body?.password
  if (!user_name || !password) {
    return res.status(400).json({ error: 'user_name and password required' })
  }
  const { rows } = await query(
    'SELECT id, user_name, password_hash, created_at FROM users WHERE user_name = $1',
    [user_name],
  )
  if (rows.length === 0) {
    return res.status(401).json({ error: 'invalid credentials' })
  }
  const user = rows[0]
  const { valid, needsUpgrade } = await verifyStoredPassword(
    user.password_hash,
    password,
  )
  if (!valid) {
    return res.status(401).json({ error: 'invalid credentials' })
  }
  if (needsUpgrade) {
    const newHash = await hashPassword(password)
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      newHash,
      user.id,
    ])
  }
  const token = signToken(user.id)
  setSessionCookie(res, token)
  return res.json({
    user: {
      id: user.id,
      user_name: user.user_name,
      created_at: user.created_at,
    },
  })
})

r.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.status(204).end()
})

/** 200 + user: null เมื่อยังไม่ล็อกอิน — ลด noise ใน DevTools (ไม่ใช้ 401) */
r.get('/me', async (req, res) => {
  const rawCookie = req.cookies?.[SESSION_COOKIE_NAME]
  const id = readSessionUserId(req)
  if (!id) {
    if (rawCookie) clearSessionCookie(res)
    return res.json({ user: null })
  }
  const { rows } = await query(
    'SELECT id, user_name, created_at FROM users WHERE id = $1',
    [id],
  )
  if (rows.length === 0) {
    clearSessionCookie(res)
    return res.json({ user: null })
  }
  return res.json({ user: rows[0] })
})

export default r
