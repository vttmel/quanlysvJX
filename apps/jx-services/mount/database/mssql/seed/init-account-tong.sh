#!/usr/bin/env bash
set -euo pipefail

DATABASE_NAME="${MSSQL_ACCOUNT_DATABASE:-account_tong}"
SEED_DIR="${MSSQL_SEED_DIR:-/var/opt/mssql/seed}"
SEED_BACKUP="${MSSQL_ACCOUNT_SEED_BAK:-${SEED_DIR}/account_tong_seed.bak}"
SAMPLE_SQL="${MSSQL_ACCOUNT_SAMPLE_SQL:-${SEED_DIR}/account_tong.sample.sql}"
DATA_FILE="${MSSQL_ACCOUNT_DATA_FILE:-/var/opt/mssql/data/account_tong_Data.MDF}"
LOG_FILE="${MSSQL_ACCOUNT_LOG_FILE:-/var/opt/mssql/data/account_tong_Log.LDF}"

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
if [ ! -x "$SQLCMD" ]; then
  SQLCMD=/opt/mssql-tools/bin/sqlcmd
fi

if [ ! -x "$SQLCMD" ]; then
  echo "sqlcmd was not found in the MSSQL image." >&2
  exit 1
fi

run_sql() {
  "$SQLCMD" -C -b -S "${MSSQL_HOST:-jxmssql}" -U sa -P "$SA_PASSWORD" "$@"
}

echo "Waiting for SQL Server to accept connections..."
for _ in $(seq 1 60); do
  if run_sql -Q "SELECT 1" >/dev/null 2>&1; then
    break
  fi

  sleep 2
done

if ! run_sql -Q "SELECT 1" >/dev/null 2>&1; then
  echo "SQL Server did not become ready in time." >&2
  exit 1
fi

database_exists() {
  run_sql -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID(N'${DATABASE_NAME}') IS NULL THEN 0 ELSE 1 END" | grep -q '^1$'
}

if database_exists; then
  echo "Database ${DATABASE_NAME} already exists. Skipping MSSQL seed."
  exit 0
fi

if [ -f "$SEED_BACKUP" ]; then
  echo "Restoring ${DATABASE_NAME} from ${SEED_BACKUP}..."
  restore_sql="
DECLARE @files TABLE (
  LogicalName nvarchar(128),
  PhysicalName nvarchar(260),
  [Type] char(1),
  FileGroupName nvarchar(128) NULL,
  Size numeric(20,0),
  MaxSize numeric(20,0),
  FileId bigint,
  CreateLSN numeric(25,0),
  DropLSN numeric(25,0) NULL,
  UniqueId uniqueidentifier,
  ReadOnlyLSN numeric(25,0) NULL,
  ReadWriteLSN numeric(25,0) NULL,
  BackupSizeInBytes bigint,
  SourceBlockSize int,
  FileGroupId int,
  LogGroupGUID uniqueidentifier NULL,
  DifferentialBaseLSN numeric(25,0) NULL,
  DifferentialBaseGUID uniqueidentifier NULL,
  IsReadOnly bit,
  IsPresent bit,
  TDEThumbprint varbinary(32) NULL,
  SnapshotUrl nvarchar(360) NULL
);

INSERT INTO @files EXEC (N'RESTORE FILELISTONLY FROM DISK = N''${SEED_BACKUP}''');

DECLARE @dataLogical nvarchar(128) = (SELECT TOP 1 LogicalName FROM @files WHERE [Type] = 'D' ORDER BY FileId);
DECLARE @logLogical nvarchar(128) = (SELECT TOP 1 LogicalName FROM @files WHERE [Type] = 'L' ORDER BY FileId);

IF @dataLogical IS NULL OR @logLogical IS NULL
  THROW 51000, 'Seed backup does not contain both data and log files.', 1;

DECLARE @restoreSql nvarchar(max) =
  N'RESTORE DATABASE [${DATABASE_NAME}] FROM DISK = N''${SEED_BACKUP}'' WITH '
  + N'MOVE N''' + REPLACE(@dataLogical, '''', '''''') + N''' TO N''${DATA_FILE}'', '
  + N'MOVE N''' + REPLACE(@logLogical, '''', '''''') + N''' TO N''${LOG_FILE}'', '
  + N'REPLACE, RECOVERY, STATS = 10';

EXEC (@restoreSql);
"
  run_sql -Q "$restore_sql"
  echo "Database ${DATABASE_NAME} restored from backup seed."
  exit 0
fi

if [ -f "$SAMPLE_SQL" ]; then
  echo "No seed backup found. Creating sample ${DATABASE_NAME} database from ${SAMPLE_SQL}..."
  run_sql -v DatabaseName="$DATABASE_NAME" -i "$SAMPLE_SQL"
  echo "Sample ${DATABASE_NAME} database created. Replace it with a real .bak for game-ready data."
  exit 0
fi

echo "No seed backup or sample SQL found. Cannot initialize ${DATABASE_NAME}." >&2
exit 1
