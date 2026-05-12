import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})

export function query (text, params) {
  return pool.query(text, params)
}

export { pool }
