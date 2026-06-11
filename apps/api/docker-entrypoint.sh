#!/usr/bin/env sh
set -eu

PROJECT_ROOT="${MANAGER_PROJECT_ROOT:-/workspace}"

mode_of() {
  stat -c '%a' "$1" 2>/dev/null || echo ""
}

ensure_dir() {
  relative_path="$1"
  expected_mode="$2"
  owner="${3:-}"
  target="${PROJECT_ROOT}/${relative_path}"

  if [ -d "$target" ] && [ "$(mode_of "$target")" = "$expected_mode" ]; then
    echo "[setup] skip ${relative_path}: mode ${expected_mode}"
    return 0
  fi

  mkdir -p "$target"
  chmod -R "$expected_mode" "$target"

  if [ -n "$owner" ]; then
    chown -R "$owner" "$target"
  fi

  echo "[setup] ensured ${relative_path}: mode ${expected_mode}"
}

ensure_file_mode() {
  relative_path="$1"
  expected_mode="$2"
  target="${PROJECT_ROOT}/${relative_path}"

  if [ ! -f "$target" ]; then
    return 0
  fi

  if [ "$(mode_of "$target")" = "$expected_mode" ]; then
    echo "[setup] skip ${relative_path}: mode ${expected_mode}"
    return 0
  fi

  chmod "$expected_mode" "$target"
  echo "[setup] ensured ${relative_path}: mode ${expected_mode}"
}

echo "[setup] preparing JX runtime directories under ${PROJECT_ROOT}"

ensure_dir "apps/jx-services/mount/config" "755"
ensure_dir "apps/jx-services/mount/database/mysql_server1/data" "777" "1000:1000"
ensure_dir "apps/jx-services/mount/database/backups/mysql" "777" "1000:1000"
ensure_dir "apps/jx-services/mount/database/mssql/data" "777" "1000:1000"
ensure_dir "apps/jx-services/mount/database/mssql/seed" "755"
ensure_dir "apps/jx-services/mount/database/mssql/certs" "755"
ensure_dir "apps/jx-services/mount/logs" "777" "1000:1000"
ensure_dir "apps/jx-services/versions" "777" "1000:1000"
ensure_dir "apps/jx-services/mount/paysyswin" "777" "1000:1000"

ensure_file_mode "apps/jx-services/mount/database/mssql/seed/account_tong_seed.bak" "644"

echo "[setup] directory preparation completed"

exec "$@"
