import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  defaultBackupSchedules,
  getBackupScheduleRuntimeStatus,
  getRunKey,
  readBackupSchedules,
  updateBackupSchedule
} from './backupSchedules.js';

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

  it('builds stable run keys in server local time', () => {
    expect(getRunKey('mysql', new Date(2026, 5, 10, 3, 0, 30))).toBe('mysql:2026-06-10T03:00');
  });

  it('reports last and next run times for enabled schedules', () => {
    const status = getBackupScheduleRuntimeStatus(
      {
        version: 1,
        schedules: {
          mysql: {
            enabled: true,
            daysOfWeek: [5],
            time: '03:00',
            retentionDays: 14,
            lastRunKey: 'mysql:2026-06-12T03:00'
          },
          mssql: {
            enabled: true,
            daysOfWeek: [1],
            time: '03:30',
            retentionDays: 14,
            lastRunKey: null
          }
        }
      },
      { schedulerEnabled: true, now: new Date(2026, 5, 12, 8, 0, 0) }
    );

    expect(status.scheduler.enabled).toBe(true);
    expect(status.status.mysql.lastRunAt).toBe(new Date(2026, 5, 12, 3, 0, 0).toISOString());
    expect(status.status.mysql.nextRunAt).toBe(new Date(2026, 5, 19, 3, 0, 0).toISOString());
    expect(status.status.mysql.scheduledToday).toBe(true);
    expect(status.status.mysql.runsToday).toBe(false);
    expect(status.status.mssql.nextRunAt).toBe(new Date(2026, 5, 15, 3, 30, 0).toISOString());
    expect(status.status.mssql.scheduledToday).toBe(false);
  });

  it('reports no next run for disabled schedules', () => {
    const status = getBackupScheduleRuntimeStatus(defaultBackupSchedules(), {
      schedulerEnabled: false,
      now: new Date(2026, 5, 12, 8, 0, 0)
    });

    expect(status.scheduler.enabled).toBe(false);
    expect(status.status.mysql.nextRunAt).toBeNull();
    expect(status.status.mysql.scheduledToday).toBe(false);
    expect(status.status.mysql.runsToday).toBe(false);
  });
});
