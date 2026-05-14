import { Router } from 'express'
import { query } from '../db.js'
import {
  clearSessionCookie,
  readSessionUserId,
  requireAuth,
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

/** แก้ชื่อผู้ใช้และ/หรือรหัสผ่าน (ต้องส่ง current_password เมื่อเปลี่ยนรหัส) */
r.patch('/me', requireAuth, async (req, res) => {
  const b = req.body || {}
  const userId = req.userId
  const rawName = b.user_name
  const newName =
    rawName !== undefined && rawName !== null
      ? String(rawName).trim()
      : null
  const newPassword =
    b.new_password !== undefined && b.new_password !== null
      ? String(b.new_password)
      : ''
  const currentPassword =
    b.current_password !== undefined && b.current_password !== null
      ? String(b.current_password)
      : ''

  const wantName = rawName !== undefined
  const wantPass = newPassword.length > 0

  if (!wantName && !wantPass) {
    return res.status(400).json({
      error: 'send user_name and/or new_password to update',
    })
  }
  if (wantName && !newName) {
    return res.status(400).json({ error: 'user_name cannot be empty' })
  }
  if (wantPass) {
    if (!currentPassword) {
      return res.status(400).json({
        error: 'current_password required to change password',
      })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'password min 6 characters' })
    }
  }

  const { rows: curRows } = await query(
    'SELECT id, user_name, password_hash FROM users WHERE id = $1',
    [userId],
  )
  if (curRows.length === 0) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'session invalid' })
  }
  const cur = curRows[0]

  if (wantPass) {
    const { valid } = await verifyStoredPassword(
      cur.password_hash,
      currentPassword,
    )
    if (!valid) {
      return res.status(401).json({ error: 'current password is incorrect' })
    }
  }

  const sets = []
  const vals = []
  let n = 1
  if (wantName && newName !== cur.user_name) {
    sets.push(`user_name = $${n++}`)
    vals.push(newName)
  }
  if (wantPass) {
    sets.push(`password_hash = $${n++}`)
    vals.push(await hashPassword(newPassword))
  }
  if (sets.length === 0) {
    const { rows } = await query(
      'SELECT id, user_name, created_at FROM users WHERE id = $1',
      [userId],
    )
    return res.json({ user: rows[0] })
  }

  vals.push(userId)
  try {
    await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${n}`,
      vals,
    )
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'user_name already exists' })
    }
    console.error(e)
    return res.status(500).json({ error: 'server error' })
  }
  const { rows } = await query(
    'SELECT id, user_name, created_at FROM users WHERE id = $1',
    [userId],
  )
  return res.json({ user: rows[0] })
})

export default r
