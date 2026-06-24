import { Alert, Anchor, Group, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';

export function UpdateBanner() {
  const { status } = useUpdateStatus();
  if (!status?.hasUpdate) {
    return null;
  }

  return (
    <Alert
      color="orange"
      title="Có bản cập nhật JX Manager mới"
      icon={<IconInfoCircle size={18} stroke={1.5} />}
      styles={{
        root: {
          border: '1px solid var(--mantine-color-orange-3)',
          backgroundColor: 'var(--mantine-color-orange-0)',
        },
      }}
    >
      <Group justify="space-between" align="center">
        <Text size="sm">
          Phiên bản hiện tại: <strong>{status.currentVersion}</strong> → Phiên bản mới:{' '}
          <strong>{status.latestVersion}</strong>
        </Text>
        <Anchor component={Link} to="/settings/system" size="sm" fw={500}>
          Mở cài đặt để cập nhật
        </Anchor>
      </Group>
    </Alert>
  );
}
