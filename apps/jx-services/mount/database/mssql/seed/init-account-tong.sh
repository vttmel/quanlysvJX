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
  echo "Database ${DATABASE_NAME} already exists."
else
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
  elif [ -f "$SAMPLE_SQL" ]; then
    echo "No seed backup found. Creating sample ${DATABASE_NAME} database from ${SAMPLE_SQL}..."
    run_sql -v DatabaseName="$DATABASE_NAME" -i "$SAMPLE_SQL"
    echo "Sample ${DATABASE_NAME} database created. Replace it with a real .bak for game-ready data."
  else
    echo "No seed backup or sample SQL found. Cannot initialize ${DATABASE_NAME}." >&2
    exit 1
  fi
fi

echo "Ensuring GameWorldRemain table exists in ${DATABASE_NAME}..."
create_table_sql="
USE [${DATABASE_NAME}];
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GameWorldRemain]') AND type in (N'U'))
BEGIN
CREATE TABLE GameWorldRemain (
    ddate DATETIME NOT NULL,
    iClientID INT NOT NULL,
    Item0 INT DEFAULT 0,
    Item1 INT DEFAULT 0,
    Item2 INT DEFAULT 0,
    Item3 INT DEFAULT 0,
    Item4 INT DEFAULT 0,
    Item5 INT DEFAULT 0,
    Item6 INT DEFAULT 0,
    Item7 INT DEFAULT 0,
    Item8 INT DEFAULT 0,
    Item9 INT DEFAULT 0,
    Item10 INT DEFAULT 0,
    Item11 INT DEFAULT 0,
    Item12 INT DEFAULT 0,
    Item13 INT DEFAULT 0,
    Item14 INT DEFAULT 0,
    Item15 INT DEFAULT 0,
    Item16 INT DEFAULT 0,
    Item17 INT DEFAULT 0,
    Item18 INT DEFAULT 0,
    Item19 INT DEFAULT 0,
    Item20 INT DEFAULT 0,
    Item21 INT DEFAULT 0,
    Item22 INT DEFAULT 0,
    Item23 INT DEFAULT 0,
    Item24 INT DEFAULT 0,
    Item25 INT DEFAULT 0,
    Item26 INT DEFAULT 0,
    Item27 INT DEFAULT 0,
    Item28 INT DEFAULT 0,
    Item29 INT DEFAULT 0,
    Item30 INT DEFAULT 0,
    Item31 INT DEFAULT 0,
    Item32 INT DEFAULT 0,
    Item33 INT DEFAULT 0,
    Item34 INT DEFAULT 0,
    Item35 INT DEFAULT 0,
    Item36 INT DEFAULT 0,
    Item37 INT DEFAULT 0,
    Item38 INT DEFAULT 0,
    Item39 INT DEFAULT 0,
    Item40 INT DEFAULT 0,
    Item41 INT DEFAULT 0,
    Item42 INT DEFAULT 0,
    Item43 INT DEFAULT 0,
    Item44 INT DEFAULT 0,
    Item45 INT DEFAULT 0,
    Item46 INT DEFAULT 0,
    Item47 INT DEFAULT 0,
    Item48 INT DEFAULT 0,
    Item49 INT DEFAULT 0,
    Item50 INT DEFAULT 0,
    Item51 INT DEFAULT 0,
    Item52 INT DEFAULT 0,
    Item53 INT DEFAULT 0,
    Item54 INT DEFAULT 0,
    Item55 INT DEFAULT 0,
    Item56 INT DEFAULT 0,
    Item57 INT DEFAULT 0,
    Item58 INT DEFAULT 0,
    Item59 INT DEFAULT 0,
    Item60 INT DEFAULT 0,
    Item61 INT DEFAULT 0,
    Item62 INT DEFAULT 0,
    Item63 INT DEFAULT 0,
    Item64 INT DEFAULT 0,
    Item65 INT DEFAULT 0,
    Item66 INT DEFAULT 0,
    Item67 INT DEFAULT 0,
    Item68 INT DEFAULT 0,
    Item69 INT DEFAULT 0,
    Item70 INT DEFAULT 0,
    Item71 INT DEFAULT 0,
    Item72 INT DEFAULT 0,
    Item73 INT DEFAULT 0,
    Item74 INT DEFAULT 0,
    Item75 INT DEFAULT 0,
    Item76 INT DEFAULT 0,
    Item77 INT DEFAULT 0,
    Item78 INT DEFAULT 0,
    Item79 INT DEFAULT 0,
    Item80 INT DEFAULT 0,
    Item81 INT DEFAULT 0,
    Item82 INT DEFAULT 0,
    Item83 INT DEFAULT 0,
    Item84 INT DEFAULT 0,
    Item85 INT DEFAULT 0,
    Item86 INT DEFAULT 0,
    Item87 INT DEFAULT 0,
    Item88 INT DEFAULT 0,
    Item89 INT DEFAULT 0,
    Item90 INT DEFAULT 0,
    Item91 INT DEFAULT 0,
    Item92 INT DEFAULT 0,
    Item93 INT DEFAULT 0,
    Item94 INT DEFAULT 0,
    Item95 INT DEFAULT 0,
    Item96 INT DEFAULT 0,
    Item97 INT DEFAULT 0,
    Item98 INT DEFAULT 0,
    Item99 INT DEFAULT 0,
    Item100 INT DEFAULT 0,
    Item101 INT DEFAULT 0,
    Item102 INT DEFAULT 0,
    Item103 INT DEFAULT 0,
    Item104 INT DEFAULT 0,
    Item105 INT DEFAULT 0,
    Item106 INT DEFAULT 0,
    Item107 INT DEFAULT 0,
    Item108 INT DEFAULT 0,
    Item109 INT DEFAULT 0,
    Item110 INT DEFAULT 0,
    Item111 INT DEFAULT 0,
    Item112 INT DEFAULT 0,
    Item113 INT DEFAULT 0,
    Item114 INT DEFAULT 0,
    Item115 INT DEFAULT 0,
    Item116 INT DEFAULT 0,
    Item117 INT DEFAULT 0,
    Item118 INT DEFAULT 0,
    Item119 INT DEFAULT 0,
    Item120 INT DEFAULT 0,
    Item121 INT DEFAULT 0,
    Item122 INT DEFAULT 0,
    Item123 INT DEFAULT 0,
    Item124 INT DEFAULT 0,
    Item125 INT DEFAULT 0,
    Item126 INT DEFAULT 0,
    Item127 INT DEFAULT 0,
    Item128 INT DEFAULT 0,
    Item129 INT DEFAULT 0,
    Item130 INT DEFAULT 0,
    Item131 INT DEFAULT 0,
    Item132 INT DEFAULT 0,
    Item133 INT DEFAULT 0,
    Item134 INT DEFAULT 0,
    Item135 INT DEFAULT 0,
    Item136 INT DEFAULT 0,
    Item137 INT DEFAULT 0,
    Item138 INT DEFAULT 0,
    Item139 INT DEFAULT 0,
    Item140 INT DEFAULT 0,
    Item141 INT DEFAULT 0,
    Item142 INT DEFAULT 0,
    Item143 INT DEFAULT 0,
    Item144 INT DEFAULT 0,
    Item145 INT DEFAULT 0,
    Item146 INT DEFAULT 0,
    Item147 INT DEFAULT 0,
    Item148 INT DEFAULT 0,
    Item149 INT DEFAULT 0,
    Item150 INT DEFAULT 0,
    Item151 INT DEFAULT 0,
    Item152 INT DEFAULT 0,
    Item153 INT DEFAULT 0,
    Item154 INT DEFAULT 0,
    Item155 INT DEFAULT 0,
    Item156 INT DEFAULT 0,
    Item157 INT DEFAULT 0,
    Item158 INT DEFAULT 0,
    Item159 INT DEFAULT 0,
    Item160 INT DEFAULT 0,
    Item161 INT DEFAULT 0,
    PRIMARY KEY (ddate, iClientID)
);
END
"
run_sql -Q "$create_table_sql"
echo "GameWorldRemain table check/creation completed."

