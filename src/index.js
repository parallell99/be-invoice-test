import 'dotenv/config'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import { runMigrations } from '../scripts/migrate.mjs'
import authRoutes from './routes/auth.js'
import invoiceRoutes from './routes/invoices.js'

const app = express()
const PORT = Number(process.env.PORT) || 4000

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1)
}

const rawOrigins = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const FRONTEND_ORIGINS = rawOrigins
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  cors({
    origin (origin, callback) {
      if (!origin) return callback(null, true)
      if (FRONTEND_ORIGINS.includes(origin)) return callback(null, true)
      callback(new Error(`Not allowed by CORS: ${origin}`))
    },
    credentials: true,
  }),
)
app.use(cookieParser())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api/invoices', invoiceRoutes)

app.use((err, _req, res, _next) => {
  if (err.message?.includes('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS' })
  }
  console.error(err)
  res.status(500).json({ error: 'server error' })
})

async function start () {
  if (process.env.SKIP_MIGRATIONS_ON_START !== '1') {
    console.log('Running DB migrations...')
    await runMigrations()
  }
  app.listen(PORT, () => {
    console.log(`invoice-api http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
 