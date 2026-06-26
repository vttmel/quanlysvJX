#!/usr/bin/env bash
set -euo pipefail

/opt/mssql/bin/sqlservr &
sqlservr_pid="$!"

cleanup() {
  kill "$sqlservr_pid" 2>/dev/null || true
  wait "$sqlservr_pid" 2>/dev/null || true
}
trap cleanup INT TERM

MSSQL_HOST="${MSSQL_HOST:-localhost}" /bin/bash /var/opt/mssql/seed/init-account-tong.sh

wait "$sqlservr_pid"
