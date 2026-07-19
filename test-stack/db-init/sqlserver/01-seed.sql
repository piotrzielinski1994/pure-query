-- SQL Server seed for purequery mssql engine smoke tests (run by the mssql-seed sidecar via sqlcmd).
-- Exercises: a multi-schema database (dbo + sales), a spread of types (int/bigint/bit/decimal/
-- nvarchar/uniqueidentifier/datetime2), a composite PK, a foreign key (for FK-nav), a non-unique
-- index, a check constraint, a stored procedure, a scalar function, a trigger, and a sequence -
-- one of each object kind the Structure view + object tabs surface. Enough rows for paging.

IF DB_ID('purequery_test') IS NULL
    CREATE DATABASE purequery_test;
GO
USE purequery_test;
GO

IF SCHEMA_ID('sales') IS NULL EXEC('CREATE SCHEMA sales');
GO

-- ---- dbo schema ----

DROP TABLE IF EXISTS dbo.orders;
DROP TABLE IF EXISTS dbo.users;
GO

CREATE TABLE dbo.users (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    uid         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    name        NVARCHAR(200) NOT NULL,
    email       NVARCHAR(200) NULL,
    balance     DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_vip      BIT NOT NULL DEFAULT 0,
    created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_users_balance CHECK (balance >= 0)
);
GO

-- 500 rows for paging (Load more). A numbers CTE generates the series.
WITH n AS (
    SELECT TOP (500) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS g
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT INTO dbo.users (name, email, balance, is_vip)
SELECT
    CONCAT('user_', g),
    CASE WHEN g % 7 = 0 THEN NULL ELSE CONCAT('user', g, '@example.com') END,
    CAST(g * 1.5 AS DECIMAL(12,2)),
    CASE WHEN g % 5 = 0 THEN 1 ELSE 0 END
FROM n;
GO

CREATE TABLE dbo.orders (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    user_id    INT NOT NULL,
    total      DECIMAL(10,2) NOT NULL,
    note       NVARCHAR(400) NULL,
    placed_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
GO

CREATE INDEX ix_orders_user ON dbo.orders(user_id);
GO

WITH n AS (
    SELECT TOP (300) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS g
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT INTO dbo.orders (user_id, total, note)
SELECT (g % 500) + 1, CAST((g % 999 + 1) * 0.99 AS DECIMAL(10,2)),
       CASE WHEN g % 3 = 0 THEN NULL ELSE CONCAT('note ', g) END
FROM n;
GO

-- ---- sales schema: a composite-PK table + a cross-schema FK target ----

DROP TABLE IF EXISTS sales.line_items;
GO

CREATE TABLE sales.line_items (
    order_id  INT NOT NULL,
    line_no   INT NOT NULL,
    sku       NVARCHAR(64) NOT NULL,
    qty       INT NOT NULL,
    CONSTRAINT pk_line_items PRIMARY KEY (order_id, line_no),
    CONSTRAINT fk_line_items_order FOREIGN KEY (order_id) REFERENCES dbo.orders(id)
);
GO

INSERT INTO sales.line_items (order_id, line_no, sku, qty) VALUES
    (1, 1, 'SKU-A', 2),
    (1, 2, 'SKU-B', 1),
    (2, 1, 'SKU-C', 5);
GO

-- ---- a sequence (object tab: Sequences) ----

DROP SEQUENCE IF EXISTS dbo.invoice_seq;
GO
CREATE SEQUENCE dbo.invoice_seq AS INT START WITH 1000 INCREMENT BY 1;
GO

-- ---- a stored procedure (object tab: Procedures) ----

CREATE OR ALTER PROCEDURE dbo.usp_user_count
AS
BEGIN
    SET NOCOUNT ON;
    SELECT COUNT(*) AS user_count FROM dbo.users;
END;
GO

-- ---- a scalar function (object tab: Functions) ----

CREATE OR ALTER FUNCTION dbo.ufn_order_total(@order_id INT)
RETURNS DECIMAL(10,2)
AS
BEGIN
    RETURN (SELECT total FROM dbo.orders WHERE id = @order_id);
END;
GO

-- ---- a trigger (object tab: Triggers) ----

CREATE OR ALTER TRIGGER dbo.trg_orders_audit
ON dbo.orders
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
END;
GO
