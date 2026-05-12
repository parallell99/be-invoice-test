import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me'

export const SESSION_COOKIE_NAME = 'invoice_session'

function getSessionCookieOpts () {
  const maxAge = 7 * 24 * 60 * 60 * 1000
  const secure =
    process.env.SESSION_COOKIE_SECURE === 'true' ||
    (process.env.NODE_ENV === 'production' &&
      process.env.SESSION_COOKIE_SECURE !== 'false')
  const raw = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase()
  const sameSite = ['strict', 'lax', 'none'].includes(raw) ? raw : 'lax'
  return { httpOnly: true, secure, sameSite, maxAge, path: '/' }
}

export function setSessionCookie (res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOpts())
}

export function clearSessionCookie (res) {
  const o = getSessionCookieOpts()
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: o.secure,
    sameSite: o.sameSite,
    path: '/',
  })
}

export function signToken (userId) {
  return jwt.sign({}, JWT_SECRET, { subject: userId, expiresIn: '7d' })
}

export function readSessionUserId (req) {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return payload.sub
  } catch {
    return null
  }
}

export function requireAuth (req, res, next) {
  const sub = readSessionUserId(req)
  if (!sub) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  req.userId = sub
  next()
}
