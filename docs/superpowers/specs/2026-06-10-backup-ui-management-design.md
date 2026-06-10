# Backup UI Management Design

## Context

The manager currently has a minimal backup panel in `apps/ui/src/features/backups/BackupPanel.tsx`. It can trigger MySQL/MSSQL backups, list files by database type, and restore a selected backup. The API already exposes backup, restore, list, and job routes in `apps/api/src/routes/backupRoutes.ts`, and backup path validation exists in `apps/api/src/backups/backupPaths.ts`.

This design upgrades the backup area into a professional operations workspace with file management, upload, per-database automatic schedules, and clearer job visibility. The implementation stays within the current React/Mantine UI and Fastify API architecture.

## Decisions

- Use a tabbed workspace inside the existing Backup tab.
- Keep the scheduler in the API process for this iteration.
- Support separate schedules for MySQL and MSSQL.
- Schedules use selected days of week plus a fixed time.
- Upload requires selecting the database type first.
- MySQL uploads accept `.sql` and `.sql.gz`; MSSQL uploads accept `.bak`.
- Editing a backup means renaming the file and editing metadata notes, not editing backup file contents.
- Store backup metadata in one JSON index file.
- Block deletion of the newest backup for each database type.
- Do not add cloud storage, auth changes, editable backup paths, or a separate worker in this iteration.

## Recommended Approach

Enhance the existing API and UI in place:

- React/Mantine remains the frontend stack.
- Fastify remains the API stack.
- Files remain on the configured backup directories.
- Metadata and schedule configuration are persisted as JSON files near the backup storage.
- Tests continue to use Vitest and existing route/component test patterns.

This gives enough operational polish without adding deployment complexity. A separate scheduler worker can be introduced later if API restarts or long-running scheduled jobs become a production concern.

## Backend Architecture

Split backup responsibilities into small modules:

- `backupFiles`: list, upload, rename, delete, and restore file operations; validates kind, filename, extension, and safe paths.
- `backupMetadata`: reads and writes the metadata index JSON; merges metadata into listed files; migrates metadata on rename; removes metadata on delete.
- `backupSchedules`: reads and writes schedule config for MySQL and MSSQL.
- `backupScheduler`: checks schedule rules and starts scheduled backup jobs.
- `backupJobs`: extends the current in-memory job store with enough fields for UI history.

Storage paths:

- Backup files stay in `mysqlBackupDir` and `mssqlBackupDir` from `ManagerConfig`.
- Metadata index defaults to `apps/jx-services/mount/database/backups/backup-metadata.json`, with optional override via `BACKUP_METADATA_FILE`.
- Schedule config defaults to `apps/jx-services/mount/database/backups/backup-schedules.json`, with optional override via `BACKUP_SCHEDULE_FILE`.

## UI Design

Replace the current simple panel with a nested tabbed workspace:

### Files

Primary operational screen for backup files.

- Top actions: `Backup now`, `Upload`, `Refresh`.
- Filters: database type (`All`, `MySQL`, `MSSQL`), search by filename/note, sort by modified time or size.
- Table columns: `Database`, `Filename`, `Size`, `Modified`, `Note`, `Source`, `Actions`.
- Row actions: `Restore`, `Rename`, `Edit note`, `Delete`.
- `Restore` keeps the existing confirm-by-filename pattern.
- `Delete` uses a confirmation modal and is blocked by the API for the newest backup of that database.

### Schedule

Two independent panels: `MySQL schedule` and `MSSQL schedule`.

Each panel contains:

- Enabled toggle.
- Days-of-week multi-select.
- Time input.
- Retention days input.
- Display-only next run estimate when possible.
- `Save schedule` and `Run now` actions.

### Jobs

Shows recent backup-related jobs.

- Columns: job kind, database, trigger, status, started at, finished at, error.
- Status badges for `running`, `succeeded`, and `failed`.
- Light auto-refresh while any job is running.

### Settings

Displays operational configuration without allowing path edits.

- MySQL backup directory.
- MSSQL backup directory.
- Metadata file path.
- Schedule file path.
- Warnings if required directories are missing or not writable.

The visual style should be dense, calm, and operational: tables, tabs, compact toolbars, confirmation modals, and restrained status badges. Avoid marketing-style layouts or decorative cards.

## API Design

Continue using the existing response envelope `{ success, data, error }`.

### Backup files

- `GET /api/backups`: returns files from both databases with merged metadata.
- `POST /api/backups/:kind`: starts a manual backup for `mysql`, `mssql`, or `all`.
- `POST /api/backups/:kind/upload`: uploads a backup file to the selected database store.
- `PATCH /api/backups/:kind/:filename`: updates filename and/or note metadata.
- `DELETE /api/backups/:kind/:filename`: deletes a backup if it is not the newest file for that database.
- `POST /api/restores/:kind`: restores the selected file; keeps server-side safe path validation.

### Schedules and jobs

- `GET /api/backup-schedules`: returns MySQL and MSSQL schedule configs.
- `PUT /api/backup-schedules/:kind`: saves one database schedule.
- `GET /api/jobs`: returns recent job history.

## Data Models

### Backup file response

```ts
type BackupFileView = {
  kind: 'mysql' | 'mssql';
  filename: string;
  size: number;
  modifiedAt: string;
  note: string | null;
  source: 'generated' | 'uploaded';
  uploadedAt: string | null;
  isLatest: boolean;
};
```

### Metadata index

```ts
type BackupMetadataIndex = {
  version: 1;
  files: Record<string, BackupMetadata>;
};

type BackupMetadata = {
  kind: 'mysql' | 'mssql';
  filename: string;
  note: string | null;
  createdByUpload: boolean;
  uploadedAt: string | null;
  updatedAt: string;
};
```

The metadata key should include kind and filename, for example `mysql/mysql-20260610-030000.sql.gz`, so MySQL and MSSQL files cannot collide.

### Schedule config

```ts
type BackupScheduleConfig = {
  version: 1;
  schedules: {
    mysql: DatabaseBackupSchedule;
    mssql: DatabaseBackupSchedule;
  };
};

type DatabaseBackupSchedule = {
  enabled: boolean;
  daysOfWeek: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  time: string;
  retentionDays: number;
  lastRunKey: string | null;
};
```

`time` uses `HH:mm` in server local time. The UI should label it clearly as server time.

## Key Flows

### Upload

1. User selects database type and file.
2. API validates `kind`, filename, extension, and path safety.
3. API writes the file to the configured backup directory for the selected kind.
4. API creates metadata with `createdByUpload: true` and `uploadedAt`.
5. UI refreshes Files and Jobs.

### Rename and note edit

1. User opens a row modal.
2. User edits filename and/or note.
3. API validates the new filename, extension, and collision rules.
4. API renames the file when filename changes.
5. API migrates metadata from the old key to the new key.
6. UI refreshes the file list.

### Delete

1. User confirms deletion in a modal.
2. API recomputes the newest backup for the selected database by `modifiedAt`.
3. API rejects the request if the selected file is the newest backup.
4. API deletes the file and removes its metadata when allowed.
5. UI refreshes the file list.

### Scheduled backup

1. API starts scheduler after app startup.
2. Scheduler checks rules every minute.
3. If a rule is enabled, today's day matches, and `HH:mm` matches server local time, scheduler starts a backup for that database.
4. Scheduler writes `lastRunKey` such as `mysql:2026-06-10T03:00` to avoid duplicate runs.
5. Scheduler does not start another job if the same database already has a running job.
6. After a successful scheduled backup, retention removes old files beyond `retentionDays` while keeping at least the newest backup.

## Error Handling

- Invalid filename or path traversal returns a validation error.
- Wrong upload extension returns a validation error.
- Rename collision returns a validation error.
- Deleting the newest backup returns a clear validation error.
- Restore of a missing or invalid file is rejected server-side.
- Corrupt metadata JSON does not crash the API; the API logs the issue and falls back to empty metadata for read paths.
- Corrupt schedule JSON does not crash the API; the scheduler stays disabled until a valid schedule is saved.
- Scheduled backup failure records a failed job with the error message and does not crash the API.

## Testing Plan

Follow the existing Vitest test style and use TDD during implementation.

- Unit tests for filename and extension validation.
- Unit tests for newest-backup delete guard.
- Unit tests for metadata merge, rename migration, and delete cleanup.
- Route tests for upload, patch, delete, schedule get, and schedule put.
- Scheduler tests with fake clock for enabled rules, disabled rules, duplicate prevention, and running-job prevention.
- UI tests for Files table actions, upload modal, rename/note modal, delete guard display, and Schedule save flow.
- Preserve the existing restore confirmation behavior test.
- E2E smoke test for the Backup tab showing Files, Schedule, Jobs, and Settings.

## Out of Scope

- Editing backup file contents.
- Cloud storage or remote backup targets.
- Separate worker service.
- Auth or permission changes.
- Editing backup directory paths in the UI.
- Trash/recycle bin behavior for deleted backups.
- Multiple schedule rules per database.

## Open Implementation Notes

- The implementation should avoid unrelated refactors outside the backup feature area.
- If multipart upload support requires a new Fastify plugin, add it only to the API package and test the upload route directly.
- The scheduler should be easy to disable in tests or injected with a fake clock.
- The UI should keep controls compact and avoid nested cards inside cards.
