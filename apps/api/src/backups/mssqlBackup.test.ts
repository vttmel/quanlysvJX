import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { AppDeps } from '../app.js';
import { backupMssql, restoreMssql } from './mssqlBackup.js';

function makeDeps(root: string, runCompose = vi.fn()) {
  return {
    config: {
      mssqlBackupDir: path.join(root, 'apps/jx-services/mount/database/backups/mssql'),
      backupMetadataFile: path.join(root, 'apps/jx-services/mount/database/backups/backup-metadata.json')
    },
    runCompose
  } as unknown as AppDeps;
}

describe('mssql backup commands', () => {
  it('writes MSSQL backups to the shared backup mount inside the container', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mssql-backup-'));
    const runCompose = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await backupMssql(makeDeps(root, runCompose));

    expect(runCompose).toHaveBeenCalledWith([
      'exec',
      '-T',
      'jxmssql',
      'bash',
      '-lc',
      expect.stringContaining("/var/opt/mssql/backups/mssql-")
    ]);
  });

  it('restores MSSQL backups from the shared backup mount inside the container', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mssql-restore-'));
    const runCompose = vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

    await restoreMssql(makeDeps(root, runCompose), 'mssql-20260615-010203.bak');

    expect(runCompose).toHaveBeenCalledWith([
      'exec',
      '-T',
      'jxmssql',
      'bash',
      '-lc',
      expect.stringContaining("/var/opt/mssql/backups/mssql-20260615-010203.bak")
    ]);
  });
});
