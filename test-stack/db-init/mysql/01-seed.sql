-- MySQL seed for purequery F5 smoke tests. MySQL has no schemas-within-a-database (schema == database),
-- so everything lives in purequery_test. Mirrors the Postgres shapes: PK + NOT NULL, NULLs, varied
-- types, a no-PK table, enough rows for paging.

USE purequery_test;

CREATE TABLE users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(255),
  balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed 500 rows via a recursive CTE (MySQL 8).
INSERT INTO users (name, email, balance)
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 500
)
SELECT
  CONCAT('user_', n),
  CASE WHEN n % 7 = 0 THEN NULL ELSE CONCAT('user', n, '@example.com') END,
  n * 1.5
FROM seq;

CREATE TABLE orders (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT NOT NULL,
  total     DECIMAL(10,2) NOT NULL,
  note      VARCHAR(255),
  placed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO orders (user_id, total, note)
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 300
)
SELECT (n % 500) + 1, (n % 999 + 1) * 0.99, CASE WHEN n % 3 = 0 THEN NULL ELSE CONCAT('note ', n) END
FROM seq;

-- No primary key: row edit/delete/clone must be blocked.
CREATE TABLE events (
  kind    VARCHAR(50),
  payload JSON
);
INSERT INTO events (kind, payload)
WITH RECURSIVE seq(n) AS (
  SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 40
)
SELECT CONCAT('evt_', n), JSON_OBJECT('n', n) FROM seq;
