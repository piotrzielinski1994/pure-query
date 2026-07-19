-- Single-schema Postgres seed: every table lives in the default `public` schema, nothing else.
-- Use this to compare the sidebar against the multi-schema `purequery_test` database - here the tree
-- has exactly one schema row (`public`), the natural minimal case for the schema-tree feature.

CREATE TABLE users (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  email text
);
INSERT INTO users (name, email)
SELECT 'user_' || g, CASE WHEN g % 4 = 0 THEN NULL ELSE 'user' || g || '@example.com' END
FROM generate_series(1, 25) AS g;

CREATE TABLE products (
  id    serial PRIMARY KEY,
  sku   text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0
);
INSERT INTO products (sku, price)
SELECT 'SKU' || lpad(g::text, 4, '0'), (g * 1.25)::numeric(10,2)
FROM generate_series(1, 25) AS g;
