import { Router } from 'express'
import { query, pool } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const r = Router()

const ALLOWED_STATUS = new Set(['draft', 'pending', 'paid'])
const ALLOWED_TERM = new Set(['net7', 'net14', 'net30', 'net60'])

function validateCreateBody (b) {
  const err = []
  if (!b?.invoice_number || String(b.invoice_number).trim() === '') {
    err.push('invoice_number')
  }
  if (!b?.invoice_date) err.push('invoice_date')
  if (!b?.payment_term || !ALLOWED_TERM.has(b.payment_term)) {
    err.push('payment_term (net7|net14|net30|net60)')
  }
  const st = b?.status || 'draft'
  if (!ALLOWED_STATUS.has(st)) err.push('status (draft|pending|paid)')
  if (!b?.bill_from || !b?.bill_to) err.push('bill_from, bill_to')
  const bf = b?.bill_from
  const bt = b?.bill_to
  if (bf) {
    ;['street_address', 'city', 'post_code', 'country'].forEach((k) => {
      if (!bf[k]) err.push(`bill_from.${k}`)
    })
  }
  if (bt) {
    ;[
      'client_name',
      'client_email',
      'street_address',
      'city',
      'post_code',
      'country',
    ].forEach((k) => {
      if (!bt[k]) err.push(`bill_to.${k}`)
    })
  }
  const lines = b?.line_items
  if (!Array.isArray(lines) || lines.length === 0) {
    err.push('line_items (non-empty array)')
  } else {
    lines.forEach((line, i) => {
      if (!line?.item_name) err.push(`line_items[${i}].item_name`)
      if (line?.quantity == null || Number(line.quantity) < 0) {
        err.push(`line_items[${i}].quantity`)
      }
      if (line?.unit_price == null || Number(line.unit_price) < 0) {
        err.push(`line_items[${i}].unit_price`)
      }
    })
  }
  return { errors: err, status: st }
}

r.get('/', async (req, res) => {
  const status = req.query.status
  let sql = `
    SELECT i.id,
           i.invoice_number,
           i.status,
           i.invoice_date,
           i.payment_term,
           i.project_description,
           i.created_at,
           i.updated_at,
           bf.city AS bill_from_city,
           bt.client_name,
           COALESCE((
             SELECT SUM(li.line_total)::numeric(16, 2)
             FROM invoice_line_items li
             WHERE li.invoice_id = i.id
           ), 0)::text AS total
    FROM invoices i
    JOIN bill_from bf ON bf.id = i.bill_from_id
    JOIN bill_to bt ON bt.id = i.bill_to_id
  `
  const params = []
  if (status && ALLOWED_STATUS.has(String(status))) {
    sql += ' WHERE i.status = $1'
    params.push(status)
  }
  sql += ' ORDER BY i.created_at DESC'
  const { rows } = await query(sql, params)
  res.json({ invoices: rows })
})

r.get('/:id', async (req, res) => {
  const { id } = req.params
  const inv = await query(
    `SELECT i.*,
            to_jsonb(bf.*) AS bill_from,
            to_jsonb(bt.*) AS bill_to
     FROM invoices i
     JOIN bill_from bf ON bf.id = i.bill_from_id
     JOIN bill_to bt ON bt.id = i.bill_to_id
     WHERE i.id = $1`,
    [id],
  )
  if (inv.rows.length === 0) {
    return res.status(404).json({ error: 'invoice not found' })
  }
  const row = inv.rows[0]
  const lines = await query(
    `SELECT id, sort_order, item_name, quantity, unit_price, line_total
     FROM invoice_line_items
     WHERE invoice_id = $1
     ORDER BY sort_order, id`,
    [id],
  )
  const { bill_from, bill_to, ...rest } = row
  res.json({
    invoice: {
      ...rest,
      bill_from,
      bill_to,
      line_items: lines.rows,
    },
  })
})

r.post('/', requireAuth, async (req, res) => {
  const { errors, status } = validateCreateBody(req.body)
  if (errors.length) {
    return res.status(400).json({ error: 'validation failed', fields: errors })
  }
  const b = req.body
  const bf = b.bill_from
  const bt = b.bill_to

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const bfIns = await client.query(
      `INSERT INTO bill_from (street_address, city, post_code, country)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [bf.street_address, bf.city, bf.post_code, bf.country],
    )
    const btIns = await client.query(
      `INSERT INTO bill_to (client_name, client_email, street_address, city, post_code, country)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        bt.client_name,
        bt.client_email,
        bt.street_address,
        bt.city,
        bt.post_code,
        bt.country,
      ],
    )

    const invIns = await client.query(
      `INSERT INTO invoices (
         invoice_number, bill_from_id, bill_to_id, status,
         project_description, invoice_date, payment_term, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        String(b.invoice_number).trim(),
        bfIns.rows[0].id,
        btIns.rows[0].id,
        status,
        b.project_description ?? null,
        b.invoice_date,
        b.payment_term,
        req.userId,
      ],
    )
    const invoiceId = invIns.rows[0].id

    for (let i = 0; i < b.line_items.length; i++) {
      const line = b.line_items[i]
      const sortOrder =
        line.sort_order != null ? Number(line.sort_order) : i
      await client.query(
        `INSERT INTO invoice_line_items (invoice_id, sort_order, item_name, quantity, unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          invoiceId,
          sortOrder,
          line.item_name,
          line.quantity,
          line.unit_price,
        ],
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ id: invoiceId })
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') {
      return res.status(409).json({ error: 'invoice_number already exists' })
    }
    console.error(e)
    return res.status(500).json({ error: 'server error' })
  } finally {
    client.release()
  }
})

r.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const b = req.body || {}
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cur = await client.query('SELECT * FROM invoices WHERE id = $1', [id])
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'invoice not found' })
    }

    const updates = []
    const vals = []
    let n = 1
    if (b.invoice_number != null) {
      updates.push(`invoice_number = $${n++}`)
      vals.push(String(b.invoice_number).trim())
    }
    if (b.status != null) {
      if (!ALLOWED_STATUS.has(b.status)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'invalid status' })
      }
      updates.push(`status = $${n++}`)
      vals.push(b.status)
    }
    if (b.project_description !== undefined) {
      updates.push(`project_description = $${n++}`)
      vals.push(b.project_description)
    }
    if (b.invoice_date != null) {
      updates.push(`invoice_date = $${n++}`)
      vals.push(b.invoice_date)
    }
    if (b.payment_term != null) {
      if (!ALLOWED_TERM.has(b.payment_term)) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'invalid payment_term' })
      }
      updates.push(`payment_term = $${n++}`)
      vals.push(b.payment_term)
    }

    if (updates.length) {
      vals.push(id)
      await client.query(
        `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${n}`,
        vals,
      )
    }

    const inv = cur.rows[0]
    if (b.bill_from && typeof b.bill_from === 'object') {
      const bf = b.bill_from
      const sets = []
      const vals = []
      let p = 1
      for (const col of ['street_address', 'city', 'post_code', 'country']) {
        if (Object.prototype.hasOwnProperty.call(bf, col)) {
          sets.push(`${col} = $${p++}`)
          vals.push(bf[col])
        }
      }
      if (sets.length) {
        vals.push(inv.bill_from_id)
        await client.query(
          `UPDATE bill_from SET ${sets.join(', ')} WHERE id = $${p}`,
          vals,
        )
      }
    }
    if (b.bill_to && typeof b.bill_to === 'object') {
      const bt = b.bill_to
      const sets = []
      const vals = []
      let p = 1
      for (const col of [
        'client_name',
        'client_email',
        'street_address',
        'city',
        'post_code',
        'country',
      ]) {
        if (Object.prototype.hasOwnProperty.call(bt, col)) {
          sets.push(`${col} = $${p++}`)
          vals.push(bt[col])
        }
      }
      if (sets.length) {
        vals.push(inv.bill_to_id)
        await client.query(
          `UPDATE bill_to SET ${sets.join(', ')} WHERE id = $${p}`,
          vals,
        )
      }
    }

    if (Array.isArray(b.line_items)) {
      await client.query(
        'DELETE FROM invoice_line_items WHERE invoice_id = $1',
        [id],
      )
      for (let i = 0; i < b.line_items.length; i++) {
        const line = b.line_items[i]
        if (!line?.item_name) continue
        const sortOrder =
          line.sort_order != null ? Number(line.sort_order) : i
        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, sort_order, item_name, quantity, unit_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, sortOrder, line.item_name, line.quantity, line.unit_price],
        )
      }
    }

    await client.query('COMMIT')
    return res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') {
      return res.status(409).json({ error: 'invoice_number already exists' })
    }
    console.error(e)
    return res.status(500).json({ error: 'server error' })
  } finally {
    client.release()
  }
})

r.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cur = await client.query(
      'SELECT bill_from_id, bill_to_id FROM invoices WHERE id = $1',
      [id],
    )
    if (cur.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'invoice not found' })
    }
    const { bill_from_id, bill_to_id } = cur.rows[0]
    await client.query('DELETE FROM invoices WHERE id = $1', [id])
    await client.query('DELETE FROM bill_from WHERE id = $1', [bill_from_id])
    await client.query('DELETE FROM bill_to WHERE id = $1', [bill_to_id])
    await client.query('COMMIT')
    return res.status(204).send()
  } catch (e) {
    await client.query('ROLLBACK')
    console.error(e)
    return res.status(500).json({ error: 'server error' })
  } finally {
    client.release()
  }
})

export default r
