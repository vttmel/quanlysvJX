import { describe, expect, it } from 'vitest';
import type { BackupFile, ScheduledBackupJob } from '@/services/types';
import {
  formatBackupNoteSummary,
  formatBackupNoteTooltip,
  formatScheduleDetailVi,
  formatScheduleDisplayName,
} from './backupDisplay';

describe('backupDisplay', () => {
  it('formats schedule display names without sequence suffixes', () => {
    const job: ScheduledBackupJob = {
      id: 'job_1',
      displayName: 'MySQL · Hàng giờ #1',
      enabled: true,
      taskType: 'backup',
      database: 'mysql',
      schedule: { type: 'hourly', everyHours: 2, minute: 0 },
      createdAt: '2026-06-12T03:00:00.000Z',
      updatedAt: '2026-06-12T03:00:00.000Z',
    };

    expect(formatScheduleDisplayName(job)).toBe('MySQL · Hàng giờ · Mỗi 2 giờ, phút 00');
    expect(formatScheduleDetailVi(job.schedule)).toBe('Mỗi 2 giờ, phút 00');
  });

  it('formats weekly schedule details in Vietnamese', () => {
    expect(formatScheduleDetailVi({ type: 'weekly', daysOfWeek: [1, 4, 6], time: '03:00' })).toBe(
      'Thứ 2, Thứ 5, Thứ 7 lúc 03:00'
    );
  });

  it('formats generated backup notes with a compact summary and detailed tooltip', () => {
    const file: BackupFile = {
      kind: 'mysql',
      filename: 'mysql-20260612-030000.sql.gz',
      size: 1024,
      modifiedAt: '2026-06-12T03:00:30.000Z',
      note: 'Tự động từ lịch MySQL · Hàng giờ #1',
      source: 'generated',
      uploadedAt: null,
      isLatest: true,
      generatedBy: {
        runId: 'run_123',
        jobId: 'job_456',
        jobDisplayName: 'MySQL · Hàng giờ #1',
        trigger: 'schedule',
        batchId: null,
        scheduledFor: '2026-06-12T03:00:00.000Z',
        generatedAt: '2026-06-12T03:00:30.000Z',
        scheduleSnapshot: { type: 'hourly', everyHours: 2, minute: 0 },
      },
    };

    expect(formatBackupNoteSummary(file)).toEqual([
      'Tự động: MySQL · Hàng giờ · Mỗi 2 giờ, phút 00',
      'Run: run_123',
    ]);
    expect(formatBackupNoteTooltip(file)).toContain('Nguồn: Sao lưu tự động');
    expect(formatBackupNoteTooltip(file)).toContain('Job ID: job_456');
    expect(formatBackupNoteTooltip(file)).toContain('Lịch: MySQL · Hàng giờ · Mỗi 2 giờ, phút 00');
  });
});
