import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBackups } from '@/hooks/useBackups';
import type { BackupKind, DatabaseBackupSchedule } from '@/services/types';

type ScheduleStatus = {
  lastRunAt: string | null;
  nextRunAt: string | null;
  scheduledToday?: boolean;
  runsToday: boolean;
};

type Props = {
  databaseReadiness: Record<BackupKind, boolean>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const dayOptions = [
  { value: '0', label: 'CN' },
  { value: '1', label: 'T2' },
  { value: '2', label: 'T3' },
  { value: '3', label: 'T4' },
  { value: '4', label: 'T5' },
  { value: '5', label: 'T6' },
  { value: '6', label: 'T7' },
];

const fallbackSchedules: Record<BackupKind, DatabaseBackupSchedule> = {
  mysql: { enabled: false, daysOfWeek: [], time: '03:00', retentionDays: 14, lastRunKey: null },
  mssql: { enabled: false, daysOfWeek: [], time: '03:30', retentionDays: 14, lastRunKey: null },
};

export function BackupScheduleTab({ databaseReadiness, onSuccess, onError }: Props) {
  const [drafts, setDrafts] =
    useState<Record<BackupKind, DatabaseBackupSchedule>>(fallbackSchedules);
  const [loadingKind, setLoadingKind] = useState<BackupKind | null>(null);

  const { schedules, saveSchedule, createBackup } = useBackups();

  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onErrorRef.current = onError;
    onSuccessRef.current = onSuccess;
  }, [onError, onSuccess]);

  useEffect(() => {
    if (schedules?.schedules) {
      setDrafts(schedules.schedules);
    }
  }, [schedules]);

  const handleSaveSchedule = useCallback(
    (kind: BackupKind) => {
      setLoadingKind(kind);
      saveSchedule({ kind, schedule: drafts[kind] })
        .then(() => onSuccessRef.current(`${kind.toUpperCase()} schedule saved`))
        .catch((error) =>
          onErrorRef.current(error instanceof Error ? error.message : 'Unable to save schedule')
        )
        .finally(() => setLoadingKind(null));
    },
    [drafts, saveSchedule]
  );

  const handleRunNow = useCallback(
    (kind: BackupKind) => {
      setLoadingKind(kind);
      createBackup(kind)
        .then(() => onSuccessRef.current(`${kind.toUpperCase()} backup started`))
        .catch((error) =>
          onErrorRef.current(error instanceof Error ? error.message : 'Unable to start backup')
        )
        .finally(() => setLoadingKind(null));
    },
    [createBackup]
  );

  const handleDraftChange = useCallback((kind: BackupKind, schedule: DatabaseBackupSchedule) => {
    setDrafts((current) => ({ ...current, [kind]: schedule }));
  }, []);

  return (
    <Stack gap="md">
      <Alert color={schedules?.scheduler?.enabled ? 'green' : 'yellow'} variant="light">
        <Group justify="space-between" align="flex-start" gap="sm">
          <Stack gap={2}>
            <Text fw={700}>
              {schedules?.scheduler?.enabled ? 'Bộ lập lịch đang bật' : 'Bộ lập lịch đang tắt'}
            </Text>
            <Text size="sm" c="dimmed">
              Giờ server: {formatDateTime(schedules?.scheduler?.serverTime)}
            </Text>
          </Stack>
          <Badge color={schedules?.scheduler?.enabled ? 'green' : 'yellow'} variant="filled">
            {schedules?.scheduler?.enabled ? 'Đang theo dõi' : 'Không chạy nền'}
          </Badge>
        </Group>
      </Alert>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {(['mysql', 'mssql'] as const).map((kind) => (
          <SchedulePanel
            key={kind}
            kind={kind}
            schedule={drafts[kind]}
            status={schedules?.status?.[kind] ?? null}
            isSchedulerEnabled={schedules?.scheduler?.enabled ?? false}
            isDatabaseReady={databaseReadiness[kind]}
            loading={loadingKind === kind}
            onChange={(schedule) => handleDraftChange(kind, schedule)}
            onSave={() => handleSaveSchedule(kind)}
            onRunNow={() => handleRunNow(kind)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

type PanelProps = {
  kind: BackupKind;
  schedule: DatabaseBackupSchedule;
  status: ScheduleStatus | null;
  isSchedulerEnabled: boolean;
  isDatabaseReady: boolean;
  loading: boolean;
  onChange: (schedule: DatabaseBackupSchedule) => void;
  onSave: () => void;
  onRunNow: () => void;
};

function SchedulePanel({
  kind,
  schedule,
  status,
  isSchedulerEnabled,
  isDatabaseReady,
  loading,
  onChange,
  onSave,
  onRunNow,
}: PanelProps) {
  const handleEnabledChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...schedule, enabled: event.currentTarget.checked });
    },
    [schedule, onChange]
  );

  const handleDaysChange = useCallback(
    (values: string[]) => {
      onChange({
        ...schedule,
        daysOfWeek: values.map(Number) as DatabaseBackupSchedule['daysOfWeek'],
      });
    },
    [schedule, onChange]
  );

  const handleTimeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...schedule, time: event.currentTarget.value });
    },
    [schedule, onChange]
  );

  const handleRetentionChange = useCallback(
    (value: string | number) => {
      onChange({ ...schedule, retentionDays: typeof value === 'number' ? value : 14 });
    },
    [schedule, onChange]
  );

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={4}>Lịch sao lưu {kind.toUpperCase()}</Title>
            <Text size="sm" c="dimmed">
              {getScheduleSummary(schedule, status, isSchedulerEnabled)}
            </Text>
          </Stack>
          <Switch checked={schedule.enabled} onChange={handleEnabledChange} label="Bật lịch" />
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          <StatusItem label="Lần chạy gần nhất" value={formatDateTime(status?.lastRunAt)} />
          <StatusItem label="Lần chạy kế tiếp" value={formatDateTime(status?.nextRunAt)} />
        </SimpleGrid>
        <Checkbox.Group
          label="Ngày chạy"
          value={schedule.daysOfWeek.map(String)}
          onChange={handleDaysChange}
        >
          <Group mt="xs">
            {dayOptions.map((day) => (
              <Checkbox key={day.value} value={day.value} label={day.label} />
            ))}
          </Group>
        </Checkbox.Group>
        <TextInput
          label="Giờ server"
          type="time"
          value={schedule.time}
          onChange={handleTimeChange}
        />
        <NumberInput
          label="Giữ file trong bao nhiêu ngày"
          min={1}
          value={schedule.retentionDays}
          onChange={handleRetentionChange}
        />
        <Group justify="flex-end">
          <Tooltip
            label={kind === 'mysql' ? 'Cần bật MySQL trước' : 'Cần bật MSSQL trước'}
            disabled={isDatabaseReady}
            withArrow
          >
            <span>
              <Button
                variant="default"
                loading={loading}
                disabled={!isDatabaseReady}
                onClick={onRunNow}
              >
                Chạy ngay
              </Button>
            </span>
          </Tooltip>
          <Button loading={loading} onClick={onSave}>
            Lưu lịch
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" fw={600}>
        {label}
      </Text>
      <Text size="sm" fw={700}>
        {value}
      </Text>
    </Stack>
  );
}

function getScheduleSummary(
  schedule: DatabaseBackupSchedule,
  status: ScheduleStatus | null,
  isSchedulerEnabled: boolean
) {
  if (!isSchedulerEnabled) {
    return 'Scheduler đang tắt trong cấu hình API.';
  }
  if (!schedule.enabled) {
    return 'Lịch này đang tắt.';
  }
  if (schedule.daysOfWeek.length === 0) {
    return 'Chưa chọn ngày chạy.';
  }
  if (status?.scheduledToday === false) {
    return 'Hôm nay không nằm trong ngày đã chọn.';
  }
  if (status?.runsToday) {
    return 'Hôm nay sẽ chạy theo giờ đã đặt.';
  }
  if (status?.nextRunAt) {
    return 'Hôm nay đã qua giờ chạy, xem lần kế tiếp bên dưới.';
  }
  return 'Chưa xác định được lần chạy kế tiếp.';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Chưa có';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Chưa có';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
