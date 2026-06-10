IF DB_ID(N'$(DatabaseName)') IS NULL
BEGIN
  DECLARE @sql nvarchar(max) = N'CREATE DATABASE [' + REPLACE(N'$(DatabaseName)', N']', N']]') + N']';
  EXEC (@sql);
END
GO

USE [$(DatabaseName)];
GO

IF OBJECT_ID(N'dbo.seed_metadata', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.seed_metadata (
    id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_seed_metadata PRIMARY KEY,
    seed_name nvarchar(128) NOT NULL,
    note nvarchar(512) NOT NULL,
    created_at datetime2(0) NOT NULL CONSTRAINT DF_seed_metadata_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.seed_metadata WHERE seed_name = N'github-sample')
BEGIN
  INSERT INTO dbo.seed_metadata (seed_name, note)
  VALUES (
    N'github-sample',
    N'This is a safe placeholder database for GitHub. Put account_tong_seed.bak in the seed folder for real account data.'
  );
END
GO
