import cron from 'node-cron';
import type { AppDeps } from '../app.js';
import { backupJobStore } from './backupJobs.js';
import { backupMssql } from './mssqlBackup.js';
import { backupMysql } from './mysqlBackup.js';
import type { BackupKind } from './backupPaths.js';
import { getRunKey, readBackupSchedules, updateBackupSchedule, type BackupDayOfWeek, type DatabaseBackupSchedule } from './backupSchedules.js';

type RunDeps = {
  now: Date;
  scheduleFile: string;
  backupMysql: () => Promise<unknown>;
  backupMssql: () => Promise<unknown>;
  hasRunningJob: (kind: BackupKind) => boolean;
};

export async function runDueBackupSchedules(deps: RunDeps) {
  const config = readBackupSchedules(deps.scheduleFile);
  const results = await Promise.all((['mysql', 'mssql'] as const).map((kind) => runKindIfDue(kind, deps, config.schedules[kind])));
  return results.filter((kind): kind is BackupKind => kind !== null);
}

export function runScheduledBackupSchedules(appDeps: AppDeps, now = new Date()) {
  return runDueBackupSchedules({
    now,
    scheduleFile: appDeps.config.backupScheduleFile,
    backupMysql: () => runScheduledJob('mysql', () => backupMysql(appDeps)),
    backupMssql: () => runScheduledJob('mssql', () => backupMssql(appDeps)),
    hasRunningJob: (kind) => backupJobStore.hasRunningJob(kind)
  });
}

export function startBackupScheduler(appDeps: AppDeps) {
  return cron.schedule('* * * * *', () => {
    void runScheduledBackupSchedules(appDeps);
  });
}

async function runKindIfDue(kind: BackupKind, deps: RunDeps, schedule: DatabaseBackupSchedule) {
  const hh = String(deps.now.getHours()).padStart(2, '0');
  const mm = String(deps.now.getMinutes()).padStart(2, '0');
  const dayOfWeek = deps.now.getDay() as BackupDayOfWeek;
  const runKey = getRunKey(kind, deps.now);
  if (!schedule.enabled || schedule.time !== `${hh}:${mm}` || !schedule.daysOfWeek.includes(dayOfWeek) || schedule.lastRunKey === runKey) {
    return null;
  }
  if (deps.hasRunningJob(kind)) {
    return null;
  }

  if (kind === 'mysql') {
    await deps.backupMysql();
  } else {
    await deps.backupMssql();
  }

  updateBackupSchedule(deps.scheduleFile, kind, { ...schedule, lastRunKey: runKey });
  return kind;
}

async function runScheduledJob<T extends object>(database: BackupKind, action: () => Promise<T>) {
  const job = backupJobStore.startJob({ kind: 'backup', database, trigger: 'schedule' });
  try {
    const result = await action();
    backupJobStore.finishJob(job.id, 'succeeded');
    return result;
  } catch (error) {
    backupJobStore.finishJob(job.id, 'failed', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}
