-- Postgres seed for purequery F5 smoke tests.
-- Exercises: native types the Any driver must text-cast (uuid/timestamptz/numeric/jsonb),
-- NOT NULL + PK markers, NULLs, enough rows for paging (Load more), AND a second schema
-- (vehicle_listing) to reproduce the cross-schema "relation does not exist" case.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---- public schema: the default search_path target ----

CREATE TABLE users (
  id          serial PRIMARY KEY,
  uid         uuid NOT NULL DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text,
  balance     numeric(12,2) NOT NULL DEFAULT 0,
  prefs       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (name, email, balance, prefs)
SELECT
  'user_' || g,
  CASE WHEN g % 7 = 0 THEN NULL ELSE 'user' || g || '@example.com' END,
  (g * 1.5)::numeric(12,2),
  jsonb_build_object('seat', g, 'vip', g % 5 = 0)
FROM generate_series(1, 500) AS g;

CREATE TABLE orders (
  id        serial PRIMARY KEY,
  user_id   integer NOT NULL REFERENCES users(id),
  total     numeric(10,2) NOT NULL,
  note      text,
  placed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO orders (user_id, total, note)
SELECT (g % 500) + 1, (g % 999 + 1) * 0.99, CASE WHEN g % 3 = 0 THEN NULL ELSE 'note ' || g END
FROM generate_series(1, 300) AS g;

-- A table with NO primary key: row edit/delete/clone must be blocked + show the reason.
CREATE TABLE events (
  kind    text,
  payload jsonb
);
INSERT INTO events (kind, payload)
SELECT 'evt_' || g, jsonb_build_object('n', g)
FROM generate_series(1, 40) AS g;

-- A name with a quote, to exercise identifier quoting on the write path.
CREATE TABLE "weird name" (
  id  serial PRIMARY KEY,
  "col;with;semis" text
);
INSERT INTO "weird name" ("col;with;semis") VALUES ('a;b;c'), ('plain');

-- ---- second schema: the sidebar must show a `vehicle_listing` schema row, and addressing
--      must be schema-qualified end-to-end (catalog/fetch/columns/PK/edit). Before the schema
--      feature an unqualified SELECT resolved against search_path=public and failed; now purequery
--      qualifies the schema, so these open + browse + edit correctly under their schema row.

CREATE SCHEMA vehicle_listing;

CREATE TABLE vehicle_listing.listing (
  listing_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL,
  status      text NOT NULL DEFAULT 'A'
);
INSERT INTO vehicle_listing.listing (customer_id, status)
SELECT 'cust_' || g, CASE WHEN g % 2 = 0 THEN 'A' ELSE 'P' END
FROM generate_series(1, 120) AS g;

CREATE TABLE vehicle_listing.vehicle (
  vehicle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vin        text NOT NULL
);
INSERT INTO vehicle_listing.vehicle (vin)
SELECT 'VIN' || lpad(g::text, 14, '0') FROM generate_series(1, 120) AS g;

-- Same-named table in two schemas: public.users (above) AND vehicle_listing.users (below) must
-- be DISTINCT leaves that open, browse, and edit independently. This is the core collision case
-- the schema feature fixes - editing one must never touch the other. Deliberately a different
-- shape (and only 10 rows) so it's obvious which one you opened.
CREATE TABLE vehicle_listing.users (
  id        serial PRIMARY KEY,
  dealer    text NOT NULL,
  region    text
);
INSERT INTO vehicle_listing.users (dealer, region)
SELECT 'dealer_' || g, CASE WHEN g % 3 = 0 THEN NULL ELSE 'region_' || g END
FROM generate_series(1, 10) AS g;

-- ---- foreign keys for FK navigation (F13) ----

-- Cross-schema FK: public.orders -> vehicle_listing.listing, so the referenced schema
-- (vehicle_listing, not public) must resolve the target node id (AC-008). Even-id orders get a
-- non-null listing_id (a "Go to listing" item appears); odd stay NULL (no item - AC-004).
ALTER TABLE orders ADD COLUMN listing_id uuid REFERENCES vehicle_listing.listing(listing_id);
UPDATE orders
SET listing_id = (SELECT listing_id FROM vehicle_listing.listing ORDER BY listing_id LIMIT 1)
WHERE id % 2 = 0;

-- Composite FK: shipment_items(region, code) -> warehouses(region, code), a 2-column key, so the
-- "Go to" item lists both pairs and the filter AND-joins them (AC-003).
CREATE TABLE warehouses (
  region text NOT NULL,
  code   text NOT NULL,
  name   text NOT NULL,
  PRIMARY KEY (region, code)
);
INSERT INTO warehouses (region, code, name) VALUES
  ('EU', 'W1', 'Berlin'), ('EU', 'W2', 'Paris'), ('US', 'W1', 'Denver');

CREATE TABLE products (
  id    serial PRIMARY KEY,
  sku   text NOT NULL,
  name  text NOT NULL
);
INSERT INTO products (sku, name) VALUES
  ('SKU-1', 'Widget'), ('SKU-2', 'Gadget'), ('SKU-3', 'Gizmo');

-- shipment_items has TWO distinct foreign keys to TWO different tables, so a single row offers two
-- separate "Go to" items: the composite (region, code) -> warehouses AND product_id -> products.
CREATE TABLE shipment_items (
  id         serial PRIMARY KEY,
  region     text NOT NULL,
  code       text NOT NULL,
  product_id integer NOT NULL REFERENCES products(id),
  qty        integer NOT NULL,
  FOREIGN KEY (region, code) REFERENCES warehouses(region, code)
);
INSERT INTO shipment_items (region, code, product_id, qty) VALUES
  ('EU', 'W1', 1, 5), ('EU', 'W2', 2, 3), ('US', 'W1', 3, 8), ('EU', 'W1', 1, 1);

-- Views so the F6 schema-browser Views tab has real data to list (public + a user schema,
-- to exercise the schema-qualified view catalog).
CREATE OR REPLACE VIEW active_users AS
  SELECT id, name, email FROM users WHERE balance > 0;

CREATE OR REPLACE VIEW recent_orders AS
  SELECT id, user_id, total, note FROM orders ORDER BY id DESC;

CREATE OR REPLACE VIEW vehicle_listing.listing_summary AS
  SELECT status, count(*) AS n FROM vehicle_listing.listing GROUP BY status;
