IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'id-restaurant-researcher-backend')
    CREATE USER [id-restaurant-researcher-backend] FROM EXTERNAL PROVIDER;
GO

GRANT SELECT, INSERT, UPDATE ON SCHEMA::rr TO [id-restaurant-researcher-backend];
GO
