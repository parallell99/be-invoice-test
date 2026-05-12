/**
 * Run SQL files in BE/migrations in order (001_*.sql, 002_*.sql, ...).
 * Tracks applied versions in schema_migrations.
 *
 * CLI: npm run migrate
 * Server: import { runMigrations } from '../scripts/migrate.mjs' (see src/index.js)
 *
 * Env: DATABASE_URL (required). MIGRATIONS_DIR (optional) — default BE/migrations.
 */
import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function migrationsDirPath () {
  return (
    (process.env.MIGRATIONS_DIR && process.env.MIGRATIONS_DIR.trim()) ||
    path.join(__dirname, '..', 'migrations')
  )
}

async function ensureMigrationsTable (client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `)
}

async function appliedVersions (client) {
  const { rows } = await client.query(
    'SELECT version FROM schema_migrations ORDER BY version',
  )
  return new Set(rows.map((r) => r.version))
}

export async function runMigrations () {
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) {
    throw new Error('Missing DATABASE_URL in environment (BE/.env)')
  }

  const migrationsDir = migrationsDirPath()
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort()

  if (files.length === 0) {
    console.log('No migration files in', migrationsDir)
    return
  }

  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()

  try {
    await ensureMigrationsTable(client)
    const done = await appliedVersions(client)

    for (const file of files) {
      const version = file.replace(/\.sql$/i, '')
      if (done.has(version)) {
        console.log('skip', version)
        continue
      }

      const sql = await readFile(path.join(migrationsDir, file), 'utf8')
      console.log('apply', version, '...')

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
          version,
        ])
        await client.query('COMMIT')
        console.log('ok ', version)
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      }
    }
  } finally {
    await client.end()
  }

  console.log('Migrations finished.')
}

function isMainModule () {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href
  } catch {
    return false
  }
}

if (isMainModule()) {
  runMigrations().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
