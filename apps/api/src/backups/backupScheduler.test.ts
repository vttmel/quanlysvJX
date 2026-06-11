import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { updateBackupSchedule } from './backupSchedules.js';
import { backupJobStore } from './backupJobs.js';
import { runDueBackupSchedules, runScheduledBackupSchedules } from './backupScheduler.js';
import type { AppDeps } from '../app.js';

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
      now: new Date(2026, 5, 10, 3, 0, 0),
      scheduleFile,
      backupMysql,
      backupMssql: vi.fn(),
      hasRunningJob: () => false
    });

    await runDueBackupSchedules({
      now: new Date(2026, 5, 10, 3, 0, 30),
      scheduleFile,
      backupMysql,
      backupMssql: vi.fn(),
      hasRunningJob: () => false
    });

    expect(backupMysql).toHaveBeenCalledTimes(1);
  });

  it('records scheduled backups in the job store', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'scheduler-'));
    const scheduleFile = path.join(root, 'backup-schedules.json');
    updateBackupSchedule(scheduleFile, 'mysql', {
      enabled: true,
      daysOfWeek: [3],
      time: '03:00',
      retentionDays: 14,
      lastRunKey: null
    });
    const runCompose = vi.fn().mockResolvedValue({ stdout: 'CREATE DATABASE server1;\n', stderr: '', exitCode: 0 });

    await runScheduledBackupSchedules(
      {
        config: {
          projectRoot: root,
          mysqlBackupDir: path.join(root, 'mysql'),
          mssqlBackupDir: path.join(root, 'mssql'),
          backupSchedule: '0 3 * * *',
          backupRetentionDays: 14,
          backupMetadataFile: path.join(root, 'backup-metadata.json'),
          backupScheduleFile: scheduleFile,
          schedulerEnabled: true,
          mssql: {
            host: 'localhost',
            port: 1433,
            database: 'account_tong',
            user: null,
            password: null,
            encrypt: false,
            trustServerCertificate: true
          }
        },
        runCompose,
        runDocker: vi.fn(),
        streamCompose: vi.fn(),
        gameAccounts: {} as AppDeps['gameAccounts']
      },
      new Date(2026, 5, 10, 3, 0, 0)
    );

    expect(backupJobStore.listJobs()).toContainEqual(
      expect.objectContaining({ kind: 'backup', database: 'mysql', trigger: 'schedule', status: 'succeeded' })
    );
  });
});
