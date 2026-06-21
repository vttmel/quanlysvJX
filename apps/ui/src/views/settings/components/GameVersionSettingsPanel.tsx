import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconDeviceFloppy, IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useGameVersionSettings } from '@/hooks/useGameVersionSettings';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function GameVersionSettingsPanel({ onSuccess, onError }: Props) {
  const { settingsQuery, validateMutation, saveMutation } = useGameVersionSettings();
  const [gameVersionPath, setGameVersionPath] = useState('');
  const [gameVersionSubPath, setGameVersionSubPath] = useState('');
  const validation = validateMutation.data?.validation ?? settingsQuery.data?.validation;
  const requiredFiles = settingsQuery.data?.requiredFiles ?? [];

  useEffect(() => {
    if (settingsQuery.data) {
      setGameVersionPath(settingsQuery.data.gameVersionPath);
      setGameVersionSubPath(settingsQuery.data.gameVersionSubPath);
    }
  }, [settingsQuery.data]);

  const payload = { gameVersionPath, gameVersionSubPath };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Cài đặt game version</Title>
          <Text size="xs" c="dimmed">
            Chọn thư mục chứa đủ các mục bắt buộc trước khi lưu vào .env.
          </Text>
        </div>

        <TextInput
          label="Đường dẫn game version"
          placeholder="/home/user/jx/version"
          value={gameVersionPath}
          onChange={(event) => setGameVersionPath(event.currentTarget.value)}
        />
        <TextInput
          label="Đường dẫn con"
          placeholder="Để trống nếu file nằm ngay thư mục gốc"
          value={gameVersionSubPath}
          onChange={(event) => setGameVersionSubPath(event.currentTarget.value)}
        />

        <Group gap="xs">
          {requiredFiles.map((requiredFile) => (
            <Badge key={requiredFile} variant="light">
              {requiredFile}
            </Badge>
          ))}
        </Group>

        {validation && !validation.isValid ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} title="Game version chưa hợp lệ">
            <Stack gap={4}>
              {validation.errors.map((error) => (
                <Text key={error} size="xs">
                  {error}
                </Text>
              ))}
            </Stack>
          </Alert>
        ) : null}
        {validation?.isValid ? (
          <Alert color="green" icon={<IconCheck size={16} />}>
            Game version hợp lệ.
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button
            variant="light"
            leftSection={<IconSearch size={16} />}
            loading={validateMutation.isPending}
            onClick={() =>
              validateMutation
                .mutateAsync(payload)
                .catch((error) =>
                  onError(error instanceof Error ? error.message : 'Kiểm tra thất bại')
                )
            }
          >
            Kiểm tra
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            loading={saveMutation.isPending}
            onClick={() =>
              saveMutation
                .mutateAsync(payload)
                .then(() =>
                  onSuccess('Đã lưu cài đặt game version. Vui lòng restart dịch vụ nếu cần.')
                )
                .catch((error) => onError(error instanceof Error ? error.message : 'Lưu thất bại'))
            }
          >
            Lưu cài đặt
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
