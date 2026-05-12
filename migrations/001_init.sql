-- 001: initial schema (PostgreSQL 16+)
-- Applied by BE/scripts/migrate.mjs

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_name       varchar(120) NOT NULL UNIQUE,
  password_hash   text         NOT NULL,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE bill_from (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  street_address   varchar(255) NOT NULL,
  city             varchar(120) NOT NULL,
  post_code        varchar(32)  NOT NULL,
  country          varchar(120) NOT NULL
);

CREATE TABLE bill_to (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  client_name      varchar(255) NOT NULL,
  client_email     varchar(255) NOT NULL,
  street_address   varchar(255) NOT NULL,
  city             varchar(120) NOT NULL,
  post_code        varchar(32)  NOT NULL,
  country          varchar(120) NOT NULL
);

CREATE TABLE invoices (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  invoice_number       varchar(64)  NOT NULL UNIQUE,
  bill_from_id         uuid         NOT NULL REFERENCES bill_from (id) ON DELETE RESTRICT,
  bill_to_id           uuid         NOT NULL REFERENCES bill_to (id) ON DELETE RESTRICT,
  status               varchar(32)  NOT NULL
    CHECK (status IN ('draft', 'pending', 'paid')),
  project_description  text,
  invoice_date         date         NOT NULL,
  payment_term         varchar(32)  NOT NULL
    CHECK (payment_term IN ('net7', 'net14', 'net30', 'net60')),
  created_by           uuid         REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_status ON invoices (status);
CREATE INDEX idx_invoices_invoice_date ON invoices (invoice_date);
CREATE INDEX idx_invoices_created_by ON invoices (created_by);

CREATE TABLE invoice_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  invoice_id  uuid        NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  sort_order  int         NOT NULL DEFAULT 0,
  item_name   varchar(255) NOT NULL,
  quantity    numeric(14, 4) NOT NULL CHECK (quantity >= 0),
  unit_price  numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  line_total  numeric(16, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items (invoice_id);

CREATE OR REPLACE FUNCTION invoices_touch_updated_at ()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION invoices_touch_updated_at ();
