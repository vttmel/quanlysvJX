import { Alert, Badge, Button, Card, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconDownload, IconRefresh } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'dayjs/locale/vi';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';
import type { UpdateRun } from '@/services/types';

dayjs.extend(relativeTime);
dayjs.locale('vi');

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

function isActiveRun(run: UpdateRun | null): boolean {
  return run?.status === 'running' || run?.status === 'restarting' || run?.status === 'verifying';
}

function getRunColor(run: UpdateRun) {
  if (run.status === 'failed') return 'red';
  if (run.status === 'succeeded') return 'green';
  return 'blue';
}

export function SelfUpdatePanel({ onSuccess, onError }: Props) {
  const {
    status,
    isLoading,
    checkNow,
    isChecking,
    latestRun,
    startRun,
    isStartingRun,
    getRun,
    streamRun,
  } = useUpdateStatus();
  const [currentRun, setCurrentRun] = useState<UpdateRun | null>(null);
  const notifiedRunIdsRef = useRef(new Set<string>());
  const streamCloseRef = useRef<(() => void) | null>(null);

  const activeRun = currentRun ?? latestRun ?? null;
  const runIsActive = isActiveRun(activeRun);
  const isUpdateBusy = isStartingRun || runIsActive;
  const logs = activeRun?.logs.map((log) => `[${log.level}] ${log.message}`) ?? [];

  const notifyTerminalRun = useCallback(
    (run: UpdateRun) => {
      if (notifiedRunIdsRef.current.has(run.runId)) return;
      if (run.status === 'succeeded') {
        notifiedRunIdsRef.current.add(run.runId);
        onSuccess(`Đã cập nhật JX Manager lên ${run.targetTag}`);
        void checkNow();
      }
      if (run.status === 'failed') {
        notifiedRunIdsRef.current.add(run.runId);
        onError(run.error ?? 'Cập nhật thất bại');
      }
    },
    [checkNow, onError, onSuccess]
  );

  const refreshRun = useCallback(
    async (runId: string) => {
      try {
        const run = await getRun(runId);
        setCurrentRun(run);
        notifyTerminalRun(run);
      } catch {
        // API may be restarting; latestRun polling will recover.
      }
    },
    [getRun, notifyTerminalRun]
  );

  const attachStream = useCallback(
    (runId: string) => {
      streamCloseRef.current?.();
      streamCloseRef.current = streamRun(runId, {
        onEvent: () => void refreshRun(runId),
        onDone: () => void refreshRun(runId),
        onError: () => void refreshRun(runId),
      });
    },
    [refreshRun, streamRun]
  );

  useEffect(() => () => streamCloseRef.current?.(), []);

  useEffect(() => {
    if (!latestRun) return;
    setCurrentRun((current) => current ?? latestRun);
    notifyTerminalRun(latestRun);
    if (isActiveRun(latestRun)) {
      attachStream(latestRun.runId);
    }
  }, [attachStream, latestRun, notifyTerminalRun]);

  const handleUpdate = async () => {
    try {
      const run = await startRun();
      setCurrentRun(run);
      if (isActiveRun(run)) {
        attachStream(run.runId);
      }
      notifyTerminalRun(run);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Không thể bắt đầu cập nhật');
    }
  };

  const checkedAtTime = status?.checkedAt ? dayjs(status.checkedAt) : null;

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Title order={4}>Cập nhật JX Manager</Title>
            {checkedAtTime && (
              <Tooltip label={checkedAtTime.format('HH:mm:ss DD/MM/YYYY')}>
                <Text size="xs" c="dimmed">
                  (Kiểm tra {checkedAtTime.fromNow()})
                </Text>
              </Tooltip>
            )}
          </Group>
          {status?.hasUpdate ? (
            <Badge color="orange" leftSection={<IconAlertTriangle size={14} stroke={1.5} />}>
              Có bản mới
            </Badge>
          ) : (
            <Badge color="green" leftSection={<IconCheck size={14} stroke={1.5} />}>
              Mới nhất
            </Badge>
          )}
        </Group>
        <Text size="sm">
          Hiện tại: <strong>{status?.currentVersion ?? 'Đang tải'}</strong> (commit{' '}
          <code>{status?.currentCommit?.substring(0, 7) ?? '...'}</code>)
        </Text>
        <Text size="sm">
          Mới nhất: <strong>{status?.latestVersion ?? 'Chưa có release'}</strong>
        </Text>
        {status?.repoDirty && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} stroke={1.5} />}
            title="Không thể cập nhật"
          >
            Repository có thay đổi chưa commit. Hãy commit hoặc stash trước khi cập nhật.
          </Alert>
        )}
        {status?.releaseNotes && (
          <Card withBorder padding="xs" radius="xs" bg="var(--mantine-color-gray-0)">
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {status.releaseNotes}
            </Text>
          </Card>
        )}
        {activeRun && (
          <Alert color={getRunColor(activeRun)} title={`Run ${activeRun.runId}`}>
            <Stack gap="xs">
              <Text size="sm">Trạng thái: {activeRun.status}</Text>
              <Text size="sm">Bước: {activeRun.stage}</Text>
              <Text size="sm">Mục tiêu: {activeRun.targetTag}</Text>
              {activeRun.error && <Text size="sm">Lỗi: {activeRun.error}</Text>}
            </Stack>
          </Alert>
        )}
        <Group>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} stroke={1.5} />}
            loading={isChecking || isLoading}
            onClick={() => void checkNow()}
          >
            Kiểm tra lại
          </Button>
          <Button
            leftSection={<IconDownload size={16} stroke={1.5} />}
            disabled={isUpdateBusy || !status?.hasUpdate || status.repoDirty}
            loading={isUpdateBusy}
            onClick={() => void handleUpdate()}
          >
            {activeRun?.status === 'failed'
              ? 'Thử lại'
              : isUpdateBusy
                ? 'Đang cập nhật...'
                : 'Cập nhật'}
          </Button>
        </Group>
        {isStartingRun && !activeRun && (
          <Alert color="blue" title="Đang khởi tạo cập nhật">
            Đang tạo job cập nhật từ GitHub. Vui lòng không đóng trang trong bước này.
          </Alert>
        )}
        {runIsActive && (
          <Alert color="blue" title="Đang cập nhật">
            Đang cập nhật JX Manager. Bước hiện tại: <strong>{activeRun?.stage}</strong>. API/UI có
            thể khởi động lại và trang sẽ tự nối lại run cập nhật.
          </Alert>
        )}
        {logs.length > 0 && (
          <Text
            component="pre"
            size="xs"
            style={{
              background: '#f5f5f5',
              padding: '10px',
              borderRadius: '4px',
              overflowX: 'auto',
            }}
          >
            {logs.join('\n')}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
