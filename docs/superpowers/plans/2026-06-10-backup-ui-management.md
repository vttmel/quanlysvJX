# Backup UI Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional backup management workspace with file upload/rename/delete/note editing, per-database automatic schedules, job visibility, and safer restore/delete flows.

**Architecture:** Keep the current React/Mantine frontend and Fastify API. Add focused backend modules for backup metadata, file operations, schedules, and scheduler execution; expose them through the existing envelope API. Replace the simple backup panel with a nested tabbed workspace that calls the expanded API.

**Tech Stack:** TypeScript, Fastify, Zod, node-cron, React, Mantine, Vitest, Testing Library, Playwright.

---

## Source Spec

Design spec: `docs/superpowers/specs/2026-06-10-backup-ui-management-design.md`

## File Structure

### Backend files

- Modify: `apps/api/package.json` and `package-lock.json` to add `@fastify/multipart` for file upload.
- Modify: `apps/api/src/config.ts` to add `backupMetadataFile`, `backupScheduleFile`, and `schedulerEnabled`.
- Modify: `apps/api/src/app.ts` to register multipart and optionally start the scheduler.
- Modify: `apps/api/src/routes/backupRoutes.ts` to delegate file/schedule operations to focused services and add new endpoints.
- Modify: `apps/api/src/backups/backupPaths.ts` to expose extension validation and kind directory helpers.
- Modify: `apps/api/src/backups/backupJobs.ts` to include trigger/database metadata and a running-job check.
- Create: `apps/api/src/backups/backupMetadata.ts` for metadata index persistence.
- Create: `apps/api/src/backups/backupMetadata.test.ts` for metadata behavior.
- Create: `apps/api/src/backups/backupFiles.ts` for listing, uploading, renaming, deleting, and merging metadata.
- Create: `apps/api/src/backups/backupFiles.test.ts` for file operation rules.
- Create: `apps/api/src/backups/backupSchedules.ts` for schedule config persistence and validation.
- Create: `apps/api/src/backups/backupSchedules.test.ts` for schedule read/write/defaults.
- Create: `apps/api/src/backups/backupScheduler.ts` for in-process scheduled backups and retention.
- Create: `apps/api/src/backups/backupScheduler.test.ts` for fake-clock scheduler behavior.
- Modify: `apps/api/src/routes/backupRoutes.test.ts` to cover upload, patch, delete, schedule get/put, and settings.

### Frontend files

- Modify: `apps/ui/src/api/types.ts` to add backup file view, schedule, job, and settings types.
- Modify: `apps/ui/src/api/client.ts` to add upload, update, delete, schedule, jobs, and settings API calls.
- Replace: `apps/ui/src/features/backups/BackupPanel.tsx` with the tabbed workspace shell.
- Create: `apps/ui/src/features/backups/BackupFilesTab.tsx` for table, filters, and file actions.
- Create: `apps/ui/src/features/backups/BackupScheduleTab.tsx` for per-database schedule panels.
- Create: `apps/ui/src/features/backups/BackupJobsTab.tsx` for job history.
- Create: `apps/ui/src/features/backups/BackupSettingsTab.tsx` for readonly backup paths and warnings.
- Create: `apps/ui/src/features/backups/BackupUploadModal.tsx` for upload flow.
- Create: `apps/ui/src/features/backups/BackupEditModal.tsx` for rename and note editing.
- Create: `apps/ui/src/features/backups/DeleteBackupModal.tsx` for delete confirmation.
- Keep and modify: `apps/ui/src/features/backups/RestoreModal.tsx` only if prop names need to align with new file view.
- Create/modify tests under `apps/ui/src/features/backups/*.test.tsx` for each tab and modal.
- Modify: `tests/e2e/manager-dashboard.spec.ts` to add a Backup tab smoke check.

---

## Task 1: API Config And Dependency Setup

**Files:**
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/routes/backupRoutes.test.ts`

- [ ] **Step 1: Install multipart dependency**

Run:

```bash
npm install --workspace apps/api @fastify/multipart
```

Expected: `apps/api/package.json` contains `@fastify/multipart` and `package-lock.json` is updated.

- [ ] **Step 2: Add failing config test coverage inside `backupRoutes.test.ts`**

Add this assertion to the existing `lists managed backup files` test after app creation:

```ts
expect(app.deps.config.backupMetadataFile.endsWith('backup-metadata.json')).toBe(true);
expect(app.deps.config.backupScheduleFile.endsWith('backup-schedules.json')).toBe(true);
expect(app.deps.config.schedulerEnabled).toBe(false);
```

Update `testConfig` in `apps/api/src/routes/backupRoutes.test.ts` to compile against the new shape that will be implemented:

```ts
function testConfig(root: string): ManagerConfig {
  return {
    projectRoot: root,
    mysqlBackupDir: path.join(root, 'mysql'),
    mssqlBackupDir: path.join(root, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(root, 'backup-metadata.json'),
    backupScheduleFile: path.join(root, 'backup-schedules.json'),
    schedulerEnabled: false
  };
}
```

- [ ] **Step 3: Run the failing API test**

Run:

```bash
npm --workspace apps/api run test -- backupRoutes.test.ts
```

Expected: FAIL with TypeScript errors for missing `backupMetadataFile`, `backupScheduleFile`, or `schedulerEnabled` on `ManagerConfig`.

- [ ] **Step 4: Implement config fields**

Modify `apps/api/src/config.ts`:

```ts
export type ManagerConfig = {
  projectRoot: string;
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupSchedule: string;
  backupRetentionDays: number;
  backupMetadataFile: string;
  backupScheduleFile: string;
  schedulerEnabled: boolean;
};

export function loadConfig(env = process.env): ManagerConfig {
  const projectRoot = path.resolve(env.MANAGER_PROJECT_ROOT ?? process.cwd());
  const backupRoot = path.resolve(projectRoot, env.BACKUP_ROOT_DIR ?? 'apps/jx-services/mount/database/backups');

  return {
    projectRoot,
    mysqlBackupDir: path.resolve(projectRoot, env.MYSQL_BACKUP_DIR ?? 'apps/jx-services/mount/database/backups/mysql'),
    mssqlBackupDir: path.resolve(projectRoot, env.MSSQL_BACKUP_DIR ?? 'apps/jx-services/mount/database/mssql/data/database_backups'),
    backupSchedule: env.BACKUP_SCHEDULE ?? '0 3 * * *',
    backupRetentionDays: Number(env.BACKUP_RETENTION_DAYS ?? '14'),
    backupMetadataFile: path.resolve(projectRoot, env.BACKUP_METADATA_FILE ?? path.join(backupRoot, 'backup-metadata.json')),
    backupScheduleFile: path.resolve(projectRoot, env.BACKUP_SCHEDULE_FILE ?? path.join(backupRoot, 'backup-schedules.json')),
    schedulerEnabled: env.BACKUP_SCHEDULER_ENABLED === 'true'
  };
}
```

- [ ] **Step 5: Verify API test passes**

Run:

```bash
npm --workspace apps/api run test -- backupRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/config.ts apps/api/src/routes/backupRoutes.test.ts
git commit -m "feat: add backup config files"
```

---

## Task 2: Backup Metadata Store

**Files:**
- Create: `apps/api/src/backups/backupMetadata.ts`
- Create: `apps/api/src/backups/backupMetadata.test.ts`

- [ ] **Step 1: Write failing metadata tests**

Create `apps/api/src/backups/backupMetadata.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createEmptyMetadataIndex,
  getMetadataKey,
  readMetadataIndex,
  removeBackupMetadata,
  upsertBackupMetadata
} from './backupMetadata.js';

describe('backup metadata', () => {
  it('creates stable keys using kind and filename', () => {
    expect(getMetadataKey('mysql', 'backup.sql.gz')).toBe('mysql/backup.sql.gz');
    expect(getMetadataKey('mssql', 'backup.bak')).toBe('mssql/backup.bak');
  });

  it('returns an empty index when the metadata file is missing', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'metadata-')), 'backup-metadata.json');

    expect(readMetadataIndex(file)).toEqual(createEmptyMetadataIndex());
  });

  it('writes, updates, and removes metadata immutably', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'metadata-')), 'backup-metadata.json');

    upsertBackupMetadata(file, {
      kind: 'mysql',
      filename: 'mysql-20260610-030000.sql.gz',
      note: 'Before maintenance',
      createdByUpload: true,
      uploadedAt: '2026-06-10T03:00:00.000Z',
      updatedAt: '2026-06-10T03:00:00.000Z'
    });

    expect(readMetadataIndex(file).files['mysql/mysql-20260610-030000.sql.gz']?.note).toBe('Before maintenance');

    upsertBackupMetadata(file, {
      kind: 'mysql',
      filename: 'mysql-20260610-030000.sql.gz',
      note: 'After maintenance',
      createdByUpload: true,
      uploadedAt: '2026-06-10T03:00:00.000Z',
      updatedAt: '2026-06-10T04:00:00.000Z'
    });

    expect(JSON.parse(readFileSync(file, 'utf8')).files['mysql/mysql-20260610-030000.sql.gz'].note).toBe('After maintenance');

    removeBackupMetadata(file, 'mysql', 'mysql-20260610-030000.sql.gz');

    expect(readMetadataIndex(file).files).toEqual({});
  });

  it('falls back to an empty index for corrupt JSON', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'metadata-')), 'backup-metadata.json');
    writeFileSync(file, '{broken', 'utf8');

    expect(readMetadataIndex(file)).toEqual(createEmptyMetadataIndex());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace apps/api run test -- backupMetadata.test.ts
```

Expected: FAIL because `backupMetadata.ts` does not exist.

- [ ] **Step 3: Implement metadata store**

Create `apps/api/src/backups/backupMetadata.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BackupKind } from './backupPaths.js';

const metadataSchema = z.object({
  version: z.literal(1),
  files: z.record(
    z.string(),
    z.object({
      kind: z.enum(['mysql', 'mssql']),
      filename: z.string(),
      note: z.string().nullable(),
      createdByUpload: z.boolean(),
      uploadedAt: z.string().nullable(),
      updatedAt: z.string()
    })
  )
});

export type BackupMetadata = z.infer<typeof metadataSchema>['files'][string];
export type BackupMetadataIndex = z.infer<typeof metadataSchema>;

export function createEmptyMetadataIndex(): BackupMetadataIndex {
  return { version: 1, files: {} };
}

export function getMetadataKey(kind: BackupKind, filename: string) {
  return `${kind}/${filename}`;
}

export function readMetadataIndex(file: string): BackupMetadataIndex {
  if (!existsSync(file)) {
    return createEmptyMetadataIndex();
  }

  try {
    return metadataSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return createEmptyMetadataIndex();
  }
}

export function writeMetadataIndex(file: string, index: BackupMetadataIndex) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

export function upsertBackupMetadata(file: string, metadata: BackupMetadata) {
  const index = readMetadataIndex(file);
  const nextIndex: BackupMetadataIndex = {
    ...index,
    files: { ...index.files, [getMetadataKey(metadata.kind, metadata.filename)]: metadata }
  };
  writeMetadataIndex(file, nextIndex);
  return nextIndex;
}

export function removeBackupMetadata(file: string, kind: BackupKind, filename: string) {
  const index = readMetadataIndex(file);
  const key = getMetadataKey(kind, filename);
  const nextFiles = Object.fromEntries(Object.entries(index.files).filter(([entryKey]) => entryKey !== key));
  const nextIndex: BackupMetadataIndex = { ...index, files: nextFiles };
  writeMetadataIndex(file, nextIndex);
  return nextIndex;
}
```

- [ ] **Step 4: Verify metadata tests pass**

Run:

```bash
npm --workspace apps/api run test -- backupMetadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/backups/backupMetadata.ts apps/api/src/backups/backupMetadata.test.ts
git commit -m "feat: add backup metadata store"
```

---

## Task 3: Backup File Operations

**Files:**
- Modify: `apps/api/src/backups/backupPaths.ts`
- Create: `apps/api/src/backups/backupFiles.ts`
- Create: `apps/api/src/backups/backupFiles.test.ts`

- [ ] **Step 1: Write failing file operation tests**

Create `apps/api/src/backups/backupFiles.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../api/errors.js';
import { listBackupFiles, renameBackupFile, deleteBackupFile, validateBackupExtension } from './backupFiles.js';

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'backup-files-'));
  const mysql = path.join(root, 'mysql');
  const mssql = path.join(root, 'mssql');
  mkdirSync(mysql, { recursive: true });
  mkdirSync(mssql, { recursive: true });
  return { root, mysql, mssql, metadata: path.join(root, 'backup-metadata.json') };
}

describe('backup files', () => {
  it('validates extensions by database kind', () => {
    expect(validateBackupExtension('mysql', 'a.sql')).toBe(true);
    expect(validateBackupExtension('mysql', 'a.sql.gz')).toBe(true);
    expect(validateBackupExtension('mssql', 'a.bak')).toBe(true);
    expect(() => validateBackupExtension('mysql', 'a.bak')).toThrow(ValidationError);
    expect(() => validateBackupExtension('mssql', 'a.sql.gz')).toThrow(ValidationError);
  });

  it('lists files with latest marker and generated source', () => {
    const root = makeRoot();
    writeFileSync(path.join(root.mysql, 'old.sql.gz'), 'old');
    writeFileSync(path.join(root.mysql, 'new.sql.gz'), 'new');

    const files = listBackupFiles({ mysqlBackupDir: root.mysql, mssqlBackupDir: root.mssql, backupMetadataFile: root.metadata });

    expect(files.filter((file) => file.kind === 'mysql')).toHaveLength(2);
    expect(files.find((file) => file.filename === 'new.sql.gz')?.source).toBe('generated');
    expect(files.filter((file) => file.kind === 'mysql' && file.isLatest)).toHaveLength(1);
  });

  it('renames a non-latest file and preserves extension rules', () => {
    const root = makeRoot();
    writeFileSync(path.join(root.mysql, 'old.sql.gz'), 'old');
    writeFileSync(path.join(root.mysql, 'new.sql.gz'), 'new');

    const renamed = renameBackupFile({
      kind: 'mysql',
      filename: 'old.sql.gz',
      nextFilename: 'renamed.sql.gz',
      note: 'renamed file',
      mysqlBackupDir: root.mysql,
      mssqlBackupDir: root.mssql,
      backupMetadataFile: root.metadata,
      now: () => new Date('2026-06-10T04:00:00.000Z')
    });

    expect(renamed.filename).toBe('renamed.sql.gz');
    expect(listBackupFiles({ mysqlBackupDir: root.mysql, mssqlBackupDir: root.mssql, backupMetadataFile: root.metadata }).some((file) => file.filename === 'old.sql.gz')).toBe(false);
  });

  it('blocks deleting the latest backup', () => {
    const root = makeRoot();
    writeFileSync(path.join(root.mysql, 'only.sql.gz'), 'only');

    expect(() =>
      deleteBackupFile({
        kind: 'mysql',
        filename: 'only.sql.gz',
        mysqlBackupDir: root.mysql,
        mssqlBackupDir: root.mssql,
        backupMetadataFile: root.metadata
      })
    ).toThrow('Cannot delete the newest mysql backup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace apps/api run test -- backupFiles.test.ts
```

Expected: FAIL because `backupFiles.ts` does not exist.

- [ ] **Step 3: Extend `backupPaths.ts`**

Add these exports to `apps/api/src/backups/backupPaths.ts`:

```ts
export function getBackupDirectory(kind: BackupKind, directories: { mysqlBackupDir: string; mssqlBackupDir: string }) {
  return kind === 'mysql' ? directories.mysqlBackupDir : directories.mssqlBackupDir;
}
```

- [ ] **Step 4: Implement `backupFiles.ts`**

Create `apps/api/src/backups/backupFiles.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ValidationError } from '../api/errors.js';
import { assertBackupFile, getBackupDirectory, type BackupKind } from './backupPaths.js';
import { getMetadataKey, readMetadataIndex, removeBackupMetadata, upsertBackupMetadata } from './backupMetadata.js';

export type BackupFileView = {
  kind: BackupKind;
  filename: string;
  size: number;
  modifiedAt: string;
  note: string | null;
  source: 'generated' | 'uploaded';
  uploadedAt: string | null;
  isLatest: boolean;
};

type FileDeps = {
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupMetadataFile: string;
};

export function validateBackupExtension(kind: BackupKind, filename: string) {
  const valid = kind === 'mysql' ? filename.endsWith('.sql') || filename.endsWith('.sql.gz') : filename.endsWith('.bak');
  if (!valid) {
    throw new ValidationError(`Invalid ${kind} backup extension`);
  }
  return true;
}

export function listBackupFiles(deps: FileDeps): BackupFileView[] {
  const metadata = readMetadataIndex(deps.backupMetadataFile);
  return (['mysql', 'mssql'] as const).flatMap((kind) => listKindFiles(kind, deps, metadata.files));
}

export function writeUploadedBackupFile(args: FileDeps & { kind: BackupKind; filename: string; data: Buffer; now?: () => Date }) {
  validateBackupExtension(args.kind, args.filename);
  const directory = getBackupDirectory(args.kind, args);
  mkdirSync(directory, { recursive: true });
  const target = assertBackupFile(directory, args.filename);
  if (existsSync(target)) {
    throw new ValidationError('Backup file already exists');
  }
  writeFileSync(target, args.data);
  const now = args.now?.() ?? new Date();
  upsertBackupMetadata(args.backupMetadataFile, {
    kind: args.kind,
    filename: args.filename,
    note: null,
    createdByUpload: true,
    uploadedAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
  return listBackupFiles(args).find((file) => file.kind === args.kind && file.filename === args.filename);
}

export function renameBackupFile(args: FileDeps & { kind: BackupKind; filename: string; nextFilename: string; note: string | null; now?: () => Date }) {
  validateBackupExtension(args.kind, args.nextFilename);
  const directory = getBackupDirectory(args.kind, args);
  const currentPath = assertBackupFile(directory, args.filename);
  const nextPath = assertBackupFile(directory, args.nextFilename);
  if (!existsSync(currentPath)) {
    throw new ValidationError('Backup file not found');
  }
  if (args.filename !== args.nextFilename && existsSync(nextPath)) {
    throw new ValidationError('Backup file already exists');
  }
  if (args.filename !== args.nextFilename) {
    renameSync(currentPath, nextPath);
    removeBackupMetadata(args.backupMetadataFile, args.kind, args.filename);
  }
  const previous = readMetadataIndex(args.backupMetadataFile).files[getMetadataKey(args.kind, args.filename)];
  const now = args.now?.() ?? new Date();
  upsertBackupMetadata(args.backupMetadataFile, {
    kind: args.kind,
    filename: args.nextFilename,
    note: args.note,
    createdByUpload: previous?.createdByUpload ?? false,
    uploadedAt: previous?.uploadedAt ?? null,
    updatedAt: now.toISOString()
  });
  return listBackupFiles(args).find((file) => file.kind === args.kind && file.filename === args.nextFilename);
}

export function deleteBackupFile(args: FileDeps & { kind: BackupKind; filename: string }) {
  const files = listBackupFiles(args).filter((file) => file.kind === args.kind);
  const target = files.find((file) => file.filename === args.filename);
  if (!target) {
    throw new ValidationError('Backup file not found');
  }
  if (target.isLatest) {
    throw new ValidationError(`Cannot delete the newest ${args.kind} backup`);
  }
  const directory = getBackupDirectory(args.kind, args);
  unlinkSync(assertBackupFile(directory, args.filename));
  removeBackupMetadata(args.backupMetadataFile, args.kind, args.filename);
  return { filename: args.filename };
}

function listKindFiles(kind: BackupKind, deps: FileDeps, metadataFiles: Record<string, { note: string | null; createdByUpload: boolean; uploadedAt: string | null }>) {
  const directory = getBackupDirectory(kind, deps);
  if (!existsSync(directory)) {
    return [];
  }
  const entries = readdirSync(directory)
    .filter((filename) => {
      try {
        validateBackupExtension(kind, filename);
        return true;
      } catch {
        return false;
      }
    })
    .map((filename) => {
      const stat = statSync(path.join(directory, filename));
      const metadata = metadataFiles[getMetadataKey(kind, filename)];
      return {
        kind,
        filename,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        note: metadata?.note ?? null,
        source: metadata?.createdByUpload ? 'uploaded' : 'generated',
        uploadedAt: metadata?.uploadedAt ?? null,
        isLatest: false
      } satisfies BackupFileView;
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const latest = entries[0]?.filename;
  return entries.map((entry) => ({ ...entry, isLatest: entry.filename === latest }));
}
```

- [ ] **Step 5: Verify file operation tests pass**

Run:

```bash
npm --workspace apps/api run test -- backupFiles.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/backups/backupPaths.ts apps/api/src/backups/backupFiles.ts apps/api/src/backups/backupFiles.test.ts
git commit -m "feat: add backup file operations"
```

---

## Task 4: Schedule Store

**Files:**
- Create: `apps/api/src/backups/backupSchedules.ts`
- Create: `apps/api/src/backups/backupSchedules.test.ts`

- [ ] **Step 1: Write failing schedule tests**

Create `apps/api/src/backups/backupSchedules.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultBackupSchedules, getRunKey, readBackupSchedules, updateBackupSchedule } from './backupSchedules.js';

describe('backup schedules', () => {
  it('returns disabled defaults when the file is missing', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'schedules-')), 'backup-schedules.json');
    expect(readBackupSchedules(file)).toEqual(defaultBackupSchedules());
  });

  it('saves one database schedule without mutating the other', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'schedules-')), 'backup-schedules.json');

    const updated = updateBackupSchedule(file, 'mysql', {
      enabled: true,
      daysOfWeek: [1, 3, 5],
      time: '03:00',
      retentionDays: 14,
      lastRunKey: null
    });

    expect(updated.schedules.mysql.enabled).toBe(true);
    expect(updated.schedules.mssql.enabled).toBe(false);
    expect(readBackupSchedules(file).schedules.mysql.daysOfWeek).toEqual([1, 3, 5]);
  });

  it('builds stable run keys', () => {
    expect(getRunKey('mysql', new Date('2026-06-10T03:00:00.000Z'))).toBe('mysql:2026-06-10T03:00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm --workspace apps/api run test -- backupSchedules.test.ts
```

Expected: FAIL because `backupSchedules.ts` does not exist.

- [ ] **Step 3: Implement schedule store**

Create `apps/api/src/backups/backupSchedules.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BackupKind } from './backupPaths.js';

const daySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);
const scheduleSchema = z.object({
  enabled: z.boolean(),
  daysOfWeek: z.array(daySchema),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  retentionDays: z.number().int().min(1),
  lastRunKey: z.string().nullable()
});

const schedulesSchema = z.object({
  version: z.literal(1),
  schedules: z.object({ mysql: scheduleSchema, mssql: scheduleSchema })
});

export type DatabaseBackupSchedule = z.infer<typeof scheduleSchema>;
export type BackupScheduleConfig = z.infer<typeof schedulesSchema>;

export function defaultBackupSchedules(): BackupScheduleConfig {
  const disabled: DatabaseBackupSchedule = { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null };
  return { version: 1, schedules: { mysql: disabled, mssql: { ...disabled, time: '03:30' } } };
}

export function readBackupSchedules(file: string): BackupScheduleConfig {
  if (!existsSync(file)) {
    return defaultBackupSchedules();
  }
  try {
    return schedulesSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return defaultBackupSchedules();
  }
}

export function writeBackupSchedules(file: string, config: BackupScheduleConfig) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function updateBackupSchedule(file: string, kind: BackupKind, schedule: DatabaseBackupSchedule) {
  const current = readBackupSchedules(file);
  const next: BackupScheduleConfig = { ...current, schedules: { ...current.schedules, [kind]: schedule } };
  writeBackupSchedules(file, next);
  return next;
}

export function getRunKey(kind: BackupKind, date: Date) {
  const local = new Date(date);
  const yyyy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  const hh = String(local.getHours()).padStart(2, '0');
  const min = String(local.getMinutes()).padStart(2, '0');
  return `${kind}:${yyyy}-${mm}-${dd}T${hh}:${min}`;
}
```

- [ ] **Step 4: Verify schedule tests pass**

Run:

```bash
npm --workspace apps/api run test -- backupSchedules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/backups/backupSchedules.ts apps/api/src/backups/backupSchedules.test.ts
git commit -m "feat: add backup schedule store"
```

---

## Task 5: Job Store Metadata And Scheduler

**Files:**
- Modify: `apps/api/src/backups/backupJobs.ts`
- Modify: `apps/api/src/backups/backupJobs.test.ts`
- Create: `apps/api/src/backups/backupScheduler.ts`
- Create: `apps/api/src/backups/backupScheduler.test.ts`

- [ ] **Step 1: Add failing job metadata tests**

Append to `apps/api/src/backups/backupJobs.test.ts`:

```ts
it('records database kind and trigger metadata', () => {
  const store = createJobStore(() => new Date('2026-06-10T03:00:00.000Z'));

  const job = store.startJob({ kind: 'backup', database: 'mysql', trigger: 'schedule' });

  expect(job).toMatchObject({ kind: 'backup', database: 'mysql', trigger: 'schedule', status: 'running' });
  expect(store.hasRunningJob('mysql')).toBe(true);
});
```

- [ ] **Step 2: Run job tests to verify failure**

Run:

```bash
npm --workspace apps/api run test -- backupJobs.test.ts
```

Expected: FAIL because `startJob` still expects a string and `hasRunningJob` is missing.

- [ ] **Step 3: Update job store**

Modify `apps/api/src/backups/backupJobs.ts` to use this shape while keeping existing callers adaptable:

```ts
import type { BackupKind } from './backupPaths.js';

export type JobStatus = 'running' | 'succeeded' | 'failed';
export type JobTrigger = 'manual' | 'schedule' | 'restore' | 'upload';

export type BackupJob = {
  id: string;
  kind: string;
  database: BackupKind | 'all' | null;
  trigger: JobTrigger;
  status: JobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type StartJobInput = {
  kind: string;
  database: BackupKind | 'all' | null;
  trigger: JobTrigger;
};

export function createJobStore(now: () => Date = () => new Date()) {
  let jobs = new Map<string, BackupJob>();
  let runningKeys = new Set<string>();

  function runningKey(input: StartJobInput) {
    return `${input.kind}:${input.database ?? 'none'}`;
  }

  return {
    startJob(input: string | StartJobInput) {
      const normalized: StartJobInput = typeof input === 'string' ? { kind: input, database: null, trigger: 'manual' } : input;
      const key = runningKey(normalized);
      if (runningKeys.has(key)) {
        throw new Error(`Job already running for ${normalized.kind}`);
      }

      const startedAt = now().toISOString();
      const id = `${normalized.kind}-${normalized.database ?? 'job'}-${now().getTime()}`;
      const job: BackupJob = { id, ...normalized, status: 'running', startedAt, finishedAt: null, error: null };
      jobs = new Map([...jobs, [id, job]]);
      runningKeys = new Set([...runningKeys, key]);
      return job;
    },

    finishJob(id: string, status: Exclude<JobStatus, 'running'>, error: string | null = null) {
      const job = jobs.get(id);
      if (!job) {
        return null;
      }

      const updated: BackupJob = { ...job, status, error, finishedAt: now().toISOString() };
      jobs = new Map([...jobs, [id, updated]]);
      runningKeys = new Set([...runningKeys].filter((key) => key !== runningKey(job)));
      return updated;
    },

    hasRunningJob(database: BackupKind) {
      return [...jobs.values()].some((job) => job.database === database && job.status === 'running');
    },

    listJobs() {
      return [...jobs.values()].sort((a: BackupJob, b: BackupJob) => b.startedAt.localeCompare(a.startedAt));
    }
  };
}

export const backupJobStore = createJobStore();
```

- [ ] **Step 4: Verify job tests pass**

Run:

```bash
npm --workspace apps/api run test -- backupJobs.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing scheduler tests**

Create `apps/api/src/backups/backupScheduler.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { updateBackupSchedule } from './backupSchedules.js';
import { runDueBackupSchedules } from './backupScheduler.js';

describe('backup scheduler', () => {
  it('runs an enabled schedule once for a matching day and time', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'scheduler-'));
    const scheduleFile = path.join(root, 'backup-schedules.json');
    updateBackupSchedule(scheduleFile, 'mysql', {
      enabled: true,
      daysOfWeek: [3],
      time: '03:00',
      retentionDays: 14,
      lastRunKey: null
    });
    const backupMysql = vi.fn().mockResolvedValue({ kind: 'mysql' });

    await runDueBackupSchedules({
      now: new Date('2026-06-10T03:00:00'),
      scheduleFile,
      backupMysql,
      backupMssql: vi.fn(),
      hasRunningJob: () => false
    });

    await runDueBackupSchedules({
      now: new Date('2026-06-10T03:00:30'),
      scheduleFile,
      backupMysql,
      backupMssql: vi.fn(),
      hasRunningJob: () => false
    });

    expect(backupMysql).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Run scheduler test to verify failure**

Run:

```bash
npm --workspace apps/api run test -- backupScheduler.test.ts
```

Expected: FAIL because `backupScheduler.ts` does not exist.

- [ ] **Step 7: Implement scheduler helper**

Create `apps/api/src/backups/backupScheduler.ts`:

```ts
import cron from 'node-cron';
import type { AppDeps } from '../app.js';
import { backupMssql } from './mssqlBackup.js';
import { backupMysql } from './mysqlBackup.js';
import { backupJobStore } from './backupJobs.js';
import type { BackupKind } from './backupPaths.js';
import { getRunKey, readBackupSchedules, updateBackupSchedule } from './backupSchedules.js';

type RunDeps = {
  now: Date;
  scheduleFile: string;
  backupMysql: () => Promise<unknown>;
  backupMssql: () => Promise<unknown>;
  hasRunningJob: (kind: BackupKind) => boolean;
};

export async function runDueBackupSchedules(deps: RunDeps) {
  const config = readBackupSchedules(deps.scheduleFile);
  await Promise.all((['mysql', 'mssql'] as const).map((kind) => runKindIfDue(kind, deps, config.schedules[kind])));
}

export function startBackupScheduler(appDeps: AppDeps) {
  return cron.schedule('* * * * *', () => {
    void runDueBackupSchedules({
      now: new Date(),
      scheduleFile: appDeps.config.backupScheduleFile,
      backupMysql: () => backupMysql(appDeps),
      backupMssql: () => backupMssql(appDeps),
      hasRunningJob: (kind) => backupJobStore.hasRunningJob(kind)
    });
  });
}

async function runKindIfDue(
  kind: BackupKind,
  deps: RunDeps,
  schedule: { enabled: boolean; daysOfWeek: number[]; time: string; retentionDays: number; lastRunKey: string | null }
) {
  const hh = String(deps.now.getHours()).padStart(2, '0');
  const mm = String(deps.now.getMinutes()).padStart(2, '0');
  const runKey = getRunKey(kind, deps.now);
  if (!schedule.enabled || schedule.time !== `${hh}:${mm}` || !schedule.daysOfWeek.includes(deps.now.getDay()) || schedule.lastRunKey === runKey) {
    return;
  }
  if (deps.hasRunningJob(kind)) {
    return;
  }
  if (kind === 'mysql') {
    await deps.backupMysql();
  } else {
    await deps.backupMssql();
  }
  updateBackupSchedule(deps.scheduleFile, kind, { ...schedule, lastRunKey: runKey });
}
```

- [ ] **Step 8: Verify scheduler tests pass**

Run:

```bash
npm --workspace apps/api run test -- backupScheduler.test.ts backupJobs.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/backups/backupJobs.ts apps/api/src/backups/backupJobs.test.ts apps/api/src/backups/backupScheduler.ts apps/api/src/backups/backupScheduler.test.ts
git commit -m "feat: add backup scheduler"
```

---

## Task 6: Backup API Routes

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/backupRoutes.ts`
- Modify: `apps/api/src/routes/backupRoutes.test.ts`

- [ ] **Step 1: Add failing route tests**

Update the existing import in `apps/api/src/routes/backupRoutes.test.ts` so it includes `mkdirSync` and `writeFileSync`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
```

Append focused tests to `apps/api/src/routes/backupRoutes.test.ts`:

```ts
it('updates a backup note through patch route', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
  const config = testConfig(root);
  mkdirSync(config.mysqlBackupDir, { recursive: true });
  writeFileSync(path.join(config.mysqlBackupDir, 'mysql-old.sql.gz'), 'backup');
  const app = await buildApp({ config });

  const response = await app.inject({
    method: 'PATCH',
    url: '/api/backups/mysql/mysql-old.sql.gz',
    payload: { filename: 'mysql-renamed.sql.gz', note: 'safe restore point' }
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().data.filename).toBe('mysql-renamed.sql.gz');
  expect(response.json().data.note).toBe('safe restore point');
});

it('blocks deleting the newest backup through delete route', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
  const config = testConfig(root);
  mkdirSync(config.mysqlBackupDir, { recursive: true });
  writeFileSync(path.join(config.mysqlBackupDir, 'mysql-latest.sql.gz'), 'backup');
  const app = await buildApp({ config });

  const response = await app.inject({ method: 'DELETE', url: '/api/backups/mysql/mysql-latest.sql.gz' });

  expect(response.statusCode).toBe(400);
  expect(response.json().error).toContain('Cannot delete the newest mysql backup');
});

it('saves and returns backup schedules', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
  const app = await buildApp({ config: testConfig(root) });

  const put = await app.inject({
    method: 'PUT',
    url: '/api/backup-schedules/mysql',
    payload: { enabled: true, daysOfWeek: [1, 3, 5], time: '03:00', retentionDays: 14, lastRunKey: null }
  });
  const get = await app.inject({ method: 'GET', url: '/api/backup-schedules' });

  expect(put.statusCode).toBe(200);
  expect(get.json().data.schedules.mysql.enabled).toBe(true);
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
npm --workspace apps/api run test -- backupRoutes.test.ts
```

Expected: FAIL because PATCH, DELETE, and schedule routes are not registered.

- [ ] **Step 3: Register multipart and scheduler in `app.ts`**

Modify `apps/api/src/app.ts`:

```ts
import multipart from '@fastify/multipart';
import { startBackupScheduler } from './backups/backupScheduler.js';
```

Inside `buildApp`, after `await app.register(sensible);`:

```ts
await app.register(multipart);
```

After route registration and before `return app;`:

```ts
if (config.schedulerEnabled) {
  const scheduledTask = startBackupScheduler(deps);
  app.addHook('onClose', () => {
    scheduledTask.stop();
  });
}
```

- [ ] **Step 4: Implement expanded routes**

In `apps/api/src/routes/backupRoutes.ts`, add schemas and route handlers using services from previous tasks. The route body shape should be:

```ts
const kindSchema = z.enum(['mysql', 'mssql']);
const updateBackupSchema = z.object({ filename: z.string().min(1), note: z.string().nullable() });
const scheduleSchema = z.object({
  enabled: z.boolean(),
  daysOfWeek: z.array(z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  retentionDays: z.number().int().min(1),
  lastRunKey: z.string().nullable()
});
```

Update route handlers to use these calls:

```ts
app.get('/api/backups', async () => ok(listBackupFiles(app.deps.config)));

app.patch('/api/backups/:kind/:filename', async (request) => {
  const { kind, filename } = request.params as { kind: string; filename: string };
  const parsedKind = kindSchema.parse(kind);
  const body = updateBackupSchema.parse(request.body);
  return ok(renameBackupFile({ ...app.deps.config, kind: parsedKind, filename, nextFilename: body.filename, note: body.note }));
});

app.delete('/api/backups/:kind/:filename', async (request) => {
  const { kind, filename } = request.params as { kind: string; filename: string };
  const parsedKind = kindSchema.parse(kind);
  return ok(deleteBackupFile({ ...app.deps.config, kind: parsedKind, filename }));
});

app.get('/api/backup-schedules', async () => ok(readBackupSchedules(app.deps.config.backupScheduleFile)));

app.put('/api/backup-schedules/:kind', async (request) => {
  const { kind } = request.params as { kind: string };
  const parsedKind = kindSchema.parse(kind);
  const schedule = scheduleSchema.parse(request.body);
  return ok(updateBackupSchedule(app.deps.config.backupScheduleFile, parsedKind, schedule));
});

app.get('/api/backup-settings', async () => ok({
  mysqlBackupDir: app.deps.config.mysqlBackupDir,
  mssqlBackupDir: app.deps.config.mssqlBackupDir,
  backupMetadataFile: app.deps.config.backupMetadataFile,
  backupScheduleFile: app.deps.config.backupScheduleFile
}));
```

Keep current backup/restore routes, but update `runJob` calls to pass metadata:

```ts
await runJob({ kind: 'backup', database: 'mysql', trigger: 'manual' }, () => backupMysql(app.deps));
```

- [ ] **Step 5: Implement upload route**

Add this route in `registerBackupRoutes`:

```ts
app.post('/api/backups/:kind/upload', async (request) => {
  const { kind } = request.params as { kind: string };
  const parsedKind = kindSchema.parse(kind);
  const part = await request.file();
  if (!part) {
    throw app.httpErrors.badRequest('Backup file is required');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of part.file) {
    chunks.push(Buffer.from(chunk));
  }
  return ok(
    writeUploadedBackupFile({
      ...app.deps.config,
      kind: parsedKind,
      filename: part.filename,
      data: Buffer.concat(chunks)
    })
  );
});
```

- [ ] **Step 6: Verify route tests pass**

Run:

```bash
npm --workspace apps/api run test -- backupRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/routes/backupRoutes.ts apps/api/src/routes/backupRoutes.test.ts
git commit -m "feat: expand backup management api"
```

---

## Task 7: UI API Types And Client

**Files:**
- Modify: `apps/ui/src/api/types.ts`
- Modify: `apps/ui/src/api/client.ts`

- [ ] **Step 1: Add types**

Modify `apps/ui/src/api/types.ts`:

```ts
export type BackupKind = 'mysql' | 'mssql';

export type BackupFile = {
  kind: BackupKind;
  filename: string;
  size: number;
  modifiedAt: string;
  note: string | null;
  source: 'generated' | 'uploaded';
  uploadedAt: string | null;
  isLatest: boolean;
};

export type BackupList = BackupFile[];

export type DatabaseBackupSchedule = {
  enabled: boolean;
  daysOfWeek: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  time: string;
  retentionDays: number;
  lastRunKey: string | null;
};

export type BackupScheduleConfig = {
  version: 1;
  schedules: Record<BackupKind, DatabaseBackupSchedule>;
};

export type BackupJob = {
  id: string;
  kind: string;
  database: BackupKind | 'all' | null;
  trigger: 'manual' | 'schedule' | 'restore' | 'upload';
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

export type BackupSettings = {
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupMetadataFile: string;
  backupScheduleFile: string;
};
```

- [ ] **Step 2: Update API client**

Modify `apps/ui/src/api/client.ts` imports and `api` object:

```ts
import type { ApiEnvelope, BackupFile, BackupJob, BackupKind, BackupList, BackupScheduleConfig, BackupSettings, DatabaseBackupSchedule, ServiceStatus } from './types';
```

Add methods:

```ts
jobs: () => request<BackupJob[]>('/api/jobs'),
backups: () => request<BackupList>('/api/backups'),
backup: (kind: BackupKind | 'all') => request<unknown>(`/api/backups/${kind}`, { method: 'POST' }),
uploadBackup: (kind: BackupKind, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return request<BackupFile>(`/api/backups/${kind}/upload`, { method: 'POST', body: form, headers: {} });
},
updateBackup: (kind: BackupKind, currentFilename: string, payload: { filename: string; note: string | null }) =>
  request<BackupFile>(`/api/backups/${kind}/${encodeURIComponent(currentFilename)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
deleteBackup: (kind: BackupKind, filename: string) =>
  request<{ filename: string }>(`/api/backups/${kind}/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
restore: (kind: BackupKind, filename: string) =>
  request<unknown>(`/api/restores/${kind}`, { method: 'POST', body: JSON.stringify({ filename }) }),
schedules: () => request<BackupScheduleConfig>('/api/backup-schedules'),
saveSchedule: (kind: BackupKind, schedule: DatabaseBackupSchedule) =>
  request<BackupScheduleConfig>(`/api/backup-schedules/${kind}`, { method: 'PUT', body: JSON.stringify(schedule) }),
backupSettings: () => request<BackupSettings>('/api/backup-settings')
```

Change `request` header handling so `FormData` does not get JSON content type:

```ts
const isFormData = init?.body instanceof FormData;
const headers = init?.body === undefined || isFormData ? init?.headers : { 'Content-Type': 'application/json', ...init.headers };
```

- [ ] **Step 3: Run UI typecheck**

Run:

```bash
npm --workspace apps/ui run typecheck
```

Expected: FAIL while `BackupPanel.tsx` still expects old `BackupList` shape.

- [ ] **Step 4: Commit only after Task 8 fixes UI consumers**

Do not commit this task alone if typecheck is failing. Continue to Task 8 and commit UI API plus UI consumers together.

---

## Task 8: UI Backup Workspace And Modals

**Files:**
- Modify: `apps/ui/src/features/backups/BackupPanel.tsx`
- Create: `apps/ui/src/features/backups/BackupFilesTab.tsx`
- Create: `apps/ui/src/features/backups/BackupScheduleTab.tsx`
- Create: `apps/ui/src/features/backups/BackupJobsTab.tsx`
- Create: `apps/ui/src/features/backups/BackupSettingsTab.tsx`
- Create: `apps/ui/src/features/backups/BackupUploadModal.tsx`
- Create: `apps/ui/src/features/backups/BackupEditModal.tsx`
- Create: `apps/ui/src/features/backups/DeleteBackupModal.tsx`
- Modify/Create tests under `apps/ui/src/features/backups/`

- [ ] **Step 1: Write failing BackupPanel workspace test**

Create `apps/ui/src/features/backups/BackupPanel.test.tsx`:

```tsx
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackupPanel } from './BackupPanel';

vi.mock('../../api/client', () => ({
  api: {
    backups: vi.fn().mockResolvedValue([]),
    jobs: vi.fn().mockResolvedValue([]),
    schedules: vi.fn().mockResolvedValue({ version: 1, schedules: { mysql: { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null }, mssql: { enabled: false, daysOfWeek: [], time: '03:30', retentionDays: 14, lastRunKey: null } } }),
    backupSettings: vi.fn().mockResolvedValue({ mysqlBackupDir: '/mysql', mssqlBackupDir: '/mssql', backupMetadataFile: '/backup-metadata.json', backupScheduleFile: '/backup-schedules.json' })
  }
}));

describe('BackupPanel', () => {
  it('renders backup workspace tabs', async () => {
    render(
      <MantineProvider>
        <BackupPanel onSuccess={vi.fn()} onError={vi.fn()} />
      </MantineProvider>
    );

    expect(await screen.findByRole('tab', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Jobs' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm --workspace apps/ui run test -- BackupPanel.test.tsx
```

Expected: FAIL because the current panel does not render nested workspace tabs.

- [ ] **Step 3: Implement `BackupPanel.tsx` shell**

Replace the panel body with Mantine tabs:

```tsx
import { Paper, Tabs } from '@mantine/core';
import { BackupFilesTab } from './BackupFilesTab';
import { BackupJobsTab } from './BackupJobsTab';
import { BackupScheduleTab } from './BackupScheduleTab';
import { BackupSettingsTab } from './BackupSettingsTab';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function BackupPanel({ onSuccess, onError }: Props) {
  return (
    <Paper withBorder p="md">
      <Tabs defaultValue="files" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="files">Files</Tabs.Tab>
          <Tabs.Tab value="schedule">Schedule</Tabs.Tab>
          <Tabs.Tab value="jobs">Jobs</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="files">
          <BackupFilesTab onSuccess={onSuccess} onError={onError} />
        </Tabs.Panel>
        <Tabs.Panel value="schedule">
          <BackupScheduleTab onSuccess={onSuccess} onError={onError} />
        </Tabs.Panel>
        <Tabs.Panel value="jobs">
          <BackupJobsTab onError={onError} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <BackupSettingsTab onError={onError} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}
```

- [ ] **Step 4: Create minimal tab components**

Create each tab with functional API calls and compact UI. `BackupFilesTab.tsx` should include: `Backup now`, `Upload`, filters, table rows, and action buttons. `BackupScheduleTab.tsx` should include one form per database with enabled checkbox, days multi-select, time input, retention input, save and run buttons. `BackupJobsTab.tsx` should list jobs and refresh on mount. `BackupSettingsTab.tsx` should show readonly paths.

Use this pattern in every tab for errors:

```tsx
useEffect(() => {
  api.backups().then(setBackups).catch((error) => onError(error instanceof Error ? error.message : 'Unable to load backups'));
}, [onError]);
```

Use these day options in `BackupScheduleTab.tsx`:

```ts
const dayOptions = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' }
];
```

- [ ] **Step 5: Create modal components**

Create these modal contracts:

```tsx
type UploadModalProps = { opened: boolean; loading: boolean; onClose: () => void; onUpload: (kind: BackupKind, file: File) => void };
type EditModalProps = { opened: boolean; file: BackupFile | null; loading: boolean; onClose: () => void; onSave: (filename: string, note: string | null) => void };
type DeleteModalProps = { opened: boolean; file: BackupFile | null; loading: boolean; onClose: () => void; onConfirm: () => void };
```

`DeleteBackupModal` must show a disabled delete button when `file?.isLatest` is true and display: `Newest backup cannot be deleted`.

- [ ] **Step 6: Update restore test if type shape changed**

Run:

```bash
npm --workspace apps/ui run test -- RestoreModal.test.tsx
```

Expected: PASS. If it fails only because props changed, keep the exact filename confirmation behavior and update the test data shape.

- [ ] **Step 7: Run UI tests and typecheck**

Run:

```bash
npm --workspace apps/ui run test -- BackupPanel.test.tsx RestoreModal.test.tsx
npm --workspace apps/ui run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/api/types.ts apps/ui/src/api/client.ts apps/ui/src/features/backups
git commit -m "feat: add backup workspace ui"
```

---

## Task 9: Verification And E2E Smoke

**Files:**
- Modify: `tests/e2e/manager-dashboard.spec.ts`
- Optionally modify: tests if API response shape requires fixture updates.

- [ ] **Step 1: Add E2E smoke check**

Add to `tests/e2e/manager-dashboard.spec.ts`:

```ts
test('backup workspace tabs are visible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Sao lưu (Backup)' }).click();

  await expect(page.getByRole('tab', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Schedule' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Jobs' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
});
```

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
npm run typecheck
npm run lint
```

Expected: PASS for all three commands.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run E2E if dev servers are available**

Run:

```bash
npm run e2e
```

Expected: PASS. If the project requires manually starting API/UI servers for Playwright, start them using the repo scripts in separate sessions and rerun `npm run e2e`.

- [ ] **Step 5: Review final diff**

Run:

```bash
git diff --stat HEAD
git diff -- apps/api/src apps/ui/src tests/e2e/manager-dashboard.spec.ts
```

Expected: changes are limited to backup management code, package dependency files, and backup E2E smoke coverage.

- [ ] **Step 6: Commit verification changes**

```bash
git add tests/e2e/manager-dashboard.spec.ts
git commit -m "test: add backup workspace smoke coverage"
```

---

## Final Acceptance Criteria

- Backup tab renders nested `Files`, `Schedule`, `Jobs`, and `Settings` tabs.
- Files tab lists both MySQL and MSSQL backup files in a single table with kind, filename, size, modified time, note, source, and latest marker.
- User can run manual backup, upload a backup for a selected database, rename a backup, edit its note, restore with filename confirmation, and delete non-latest backups.
- API rejects path traversal, invalid upload extensions, rename collisions, missing files, and deletion of the newest backup for a database.
- Schedule tab can save separate MySQL and MSSQL schedules with enabled flag, days of week, time, and retention days.
- Scheduler runs matching enabled schedules once per scheduled minute and does not start a duplicate job for a running database.
- Jobs tab shows recent backup, restore, upload, manual, and scheduled activity with status.
- Settings tab shows readonly configured paths.
- `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.

## Self-Review Notes

- Spec coverage: all approved features are mapped to tasks: filesystem metadata, file management, upload, delete guard, per-database schedules, scheduler, jobs, tabbed UI, settings, and verification.
- Scope check: this plan does not add auth, cloud storage, editable backup paths, file content editing, trash behavior, or a worker service.
- Type consistency: backend uses `BackupKind = 'mysql' | 'mssql'`; frontend mirrors it as `BackupKind`; schedule fields match the design spec.
