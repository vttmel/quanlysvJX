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
export type BackupDayOfWeek = z.infer<typeof daySchema>;

export type BackupScheduleRuntimeStatus = BackupScheduleConfig & {
  scheduler: {
    enabled: boolean;
    serverTime: string;
  };
  status: Record<
    BackupKind,
    {
      lastRunAt: string | null;
      nextRunAt: string | null;
      scheduledToday: boolean;
      runsToday: boolean;
    }
  >;
};

export function defaultBackupSchedules(): BackupScheduleConfig {
  const disabled: DatabaseBackupSchedule = {
    enabled: false,
    daysOfWeek: [],
    time: '03:00',
    retentionDays: 14,
    lastRunKey: null
  };

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
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${kind}:${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function getBackupScheduleRuntimeStatus(
  config: BackupScheduleConfig,
  options: { schedulerEnabled: boolean; now?: Date }
): BackupScheduleRuntimeStatus {
  const now = options.now ?? new Date();

  return {
    ...config,
    scheduler: {
      enabled: options.schedulerEnabled,
      serverTime: now.toISOString()
    },
    status: {
      mysql: getScheduleStatus('mysql', config.schedules.mysql, now),
      mssql: getScheduleStatus('mssql', config.schedules.mssql, now)
    }
  };
}

function getScheduleStatus(kind: BackupKind, schedule: DatabaseBackupSchedule, now: Date) {
  const scheduledToday = schedule.enabled && schedule.daysOfWeek.includes(now.getDay() as BackupDayOfWeek);
  return {
    lastRunAt: getLastRunAt(kind, schedule.lastRunKey),
    nextRunAt: getNextRunAt(schedule, now),
    scheduledToday,
    runsToday: scheduledToday && isFutureToday(schedule, now)
  };
}

function getLastRunAt(kind: BackupKind, lastRunKey: string | null) {
  const match = lastRunKey?.match(new RegExp(`^${kind}:(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$`));
  if (!match) {
    return null;
  }

  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute] = match;
  if (!rawYear || !rawMonth || !rawDay || !rawHour || !rawMinute) {
    return null;
  }

  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

function getNextRunAt(schedule: DatabaseBackupSchedule, now: Date) {
  if (!schedule.enabled || schedule.daysOfWeek.length === 0) {
    return null;
  }

  const time = parseScheduleTime(schedule.time);
  if (!time) {
    return null;
  }

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    candidate.setHours(time.hour, time.minute, 0, 0);

    if (schedule.daysOfWeek.includes(candidate.getDay() as BackupDayOfWeek) && candidate > now) {
      return candidate.toISOString();
    }
  }

  return null;
}

function isFutureToday(schedule: DatabaseBackupSchedule, now: Date) {
  const time = parseScheduleTime(schedule.time);
  if (!time) {
    return false;
  }

  const candidate = new Date(now);
  candidate.setHours(time.hour, time.minute, 0, 0);
  return candidate > now;
}

function parseScheduleTime(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, rawHour, rawMinute] = match;
  if (!rawHour || !rawMinute) {
    return null;
  }

  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return null;
  }

  return { hour, minute };
}
