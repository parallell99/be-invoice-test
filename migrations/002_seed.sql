-- 002: ข้อมูลตัวอย่าง (idempotent — ข้ามถ้ามี invoice_number นั้นแล้ว)
-- User: demo_user / secret12 (Argon2id — สร้างด้วย BE: argon2.hash('secret12', { type: argon2id }))

INSERT INTO users (user_name, password_hash)
VALUES (
  'demo_user',
  '$argon2id$v=19$m=65536,t=3,p=4$kE88nW2M6qwcnbzAzG/MCA$yPRrSP7cjHmV9RLVknEz4jn4Gg9M6PEe1+fF5UDv+is'
)
ON CONFLICT (user_name) DO NOTHING;

DO $$
DECLARE
  uid uuid;
  bf_id uuid;
  bt_id uuid;
  inv_id uuid;
BEGIN
  SELECT id INTO uid FROM users WHERE user_name = 'demo_user';
  IF uid IS NULL THEN
    RAISE EXCEPTION 'seed: demo_user not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = 'SEED-XM9141') THEN
    INSERT INTO bill_from (street_address, city, post_code, country)
    VALUES ('19 Union Terrace', 'London', 'E1 3EZ', 'United Kingdom')
    RETURNING id INTO bf_id;

    INSERT INTO bill_to (client_name, client_email, street_address, city, post_code, country)
    VALUES ('Alex Grim', 'alexgrim@mail.com', '84 Church Way', 'Bradford', 'BD1 9PB', 'United Kingdom')
    RETURNING id INTO bt_id;

    INSERT INTO invoices (
      invoice_number, bill_from_id, bill_to_id, status,
      project_description, invoice_date, payment_term, created_by
    ) VALUES (
      'SEED-XM9141', bf_id, bt_id, 'pending',
      'Graphic Design', '2021-08-21'::date, 'net30', uid
    )
    RETURNING id INTO inv_id;

    INSERT INTO invoice_line_items (invoice_id, sort_order, item_name, quantity, unit_price)
    VALUES
      (inv_id, 0, 'Banner Design', 1, 156),
      (inv_id, 1, 'Email Design', 1, 400);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = 'SEED-INV-002') THEN
    INSERT INTO bill_from (street_address, city, post_code, country)
    VALUES ('100 Design St', 'Manchester', 'M1 1AE', 'United Kingdom')
    RETURNING id INTO bf_id;

    INSERT INTO bill_to (client_name, client_email, street_address, city, post_code, country)
    VALUES ('Sample Co Ltd', 'accounts@sample.co', '22 River Rd', 'Leeds', 'LS1 4DY', 'United Kingdom')
    RETURNING id INTO bt_id;

    INSERT INTO invoices (
      invoice_number, bill_from_id, bill_to_id, status,
      project_description, invoice_date, payment_term, created_by
    ) VALUES (
      'SEED-INV-002', bf_id, bt_id, 'draft',
      'Brand refresh', '2026-05-11'::date, 'net14', uid
    )
    RETURNING id INTO inv_id;

    INSERT INTO invoice_line_items (invoice_id, sort_order, item_name, quantity, unit_price)
    VALUES (inv_id, 0, 'Logo concepts', 3, 120);
  END IF;
END $$;
