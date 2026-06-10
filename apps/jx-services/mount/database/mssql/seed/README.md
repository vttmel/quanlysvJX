# MSSQL `account_tong` seed

This folder contains GitHub-safe seed assets for the first MSSQL startup.

## Default behavior

`init-account-tong.sh` is idempotent:

1. If database `account_tong` already exists, it exits without changing data.
2. If `account_tong_seed.bak` exists in this folder, it restores `account_tong` from that backup.
3. If no `.bak` exists, it runs `account_tong.sample.sql` and creates a minimal placeholder database.

## Real account data

Do not commit real account data to GitHub. Put the real backup here locally:

```txt
apps/jx-services/mount/database/mssql/seed/account_tong_seed.bak
```

The repository `.gitignore` excludes `*.bak`, `*.mdf`, and `*.ldf` files in this folder.

## GitHub sample

`account_tong.sample.sql` intentionally contains only a small marker table. It is safe to commit, but it is not a complete game account database. It expects the `DatabaseName` sqlcmd variable, which `init-account-tong.sh` provides automatically.
