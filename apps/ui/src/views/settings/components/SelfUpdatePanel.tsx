import { Alert, Badge, Button, Card, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconDownload, IconRefresh } from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useRef, useState } from 'react';
import 'dayjs/locale/vi';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';
import type { UpdateEvent } from '@/services/types';

dayjs.extend(relativeTime);
dayjs.locale('vi');

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function SelfUpdatePanel({ onSuccess, onError }: Props) {
  const { status, isLoading, checkNow, isChecking, streamUpdate } = useUpdateStatus();
  const [logs, setLogs] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isWaitingForRestart, setIsWaitingForRestart] = useState(false);
  const isRestartingRef = useRef(false);
  const healthPollRef = useRef<number | null>(null);

  useEffect(() => () => stopHealthPolling(), []);

  const handleEvent = (event: UpdateEvent) => {
    setLogs((current) => [...current, event.message]);
    if (event.type === 'restarting') {
      isRestartingRef.current = true;
      setIsWaitingForRestart(true);
      onSuccess('Đang khởi động lại JX Manager');
      pollHealth();
    }
    if (event.type === 'error') {
      onError(event.message);
    }
  };

  const stopHealthPolling = () => {
    if (healthPollRef.current !== null) {
      window.clearInterval(healthPollRef.current);
      healthPollRef.current = null;
    }
  };

  const pollHealth = () => {
    stopHealthPolling();
    const startedAt = Date.now();
    healthPollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok && Date.now() - startedAt > 8000) {
          stopHealthPolling();
          window.location.reload();
        }
      } catch {
        // API is restarting.
      }

      if (Date.now() - startedAt > 120000) {
        stopHealthPolling();
        isRestartingRef.current = false;
        setIsUpdating(false);
        setIsWaitingForRestart(false);
        onError('Không thể kết nối lại API sau khi cập nhật');
      }
    }, 3000);
  };

  const handleUpdate = () => {
    setIsUpdating(true);
    setLogs([]);
    streamUpdate({
      onEvent: handleEvent,
      onDone: () => setIsUpdating(false),
      onError: (message) => {
        if (isRestartingRef.current) {
          setLogs((current) => [...current, 'Mất kết nối tạm thời, đang chờ API khởi động lại...']);
          return;
        }
        setIsUpdating(false);
        onError(message);
      },
    });
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
            disabled={!status?.hasUpdate || status.repoDirty}
            loading={isUpdating || isWaitingForRestart}
            onClick={handleUpdate}
          >
            {isWaitingForRestart ? 'Đang chờ khởi động lại...' : 'Cập nhật'}
          </Button>
        </Group>
        {isWaitingForRestart && (
          <Alert color="blue" title="Đang cập nhật">
            API/UI đang khởi động lại. Trang sẽ tự tải lại khi API sẵn sàng.
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
