import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { api } from '@/services/client';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function EnvEditor({ onSuccess, onError }: Props) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const envQuery = useQuery({
    queryKey: ['env'],
    queryFn: api.env
  });

  useEffect(() => {
    if (envQuery.data) {
      setContent(envQuery.data.content);
    }
  }, [envQuery.data]);

  const saveMutation = useMutation({
    mutationFn: api.saveEnv,
    onSuccess: async () => {
      onSuccess('Lưu cấu hình file .env thành công');
      await queryClient.invalidateQueries({ queryKey: ['env'] });
      await queryClient.invalidateQueries({ queryKey: ['versions'] });
    },
    onError: (error) => onError(error instanceof Error ? error.message : 'Lưu file cấu hình thất bại')
  });

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <div>
          <Title order={4}>Cấu hình biến môi trường (.env)</Title>
          <Text size="xs" color="dimmed">
            Chỉnh sửa trực tiếp file .env cấu hình hệ thống máy chủ JX. Nhớ kiểm tra kỹ các thông số trước khi lưu.
          </Text>
        </div>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          rows={15}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />

        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={envQuery.isFetching}
            onClick={() => envQuery.refetch()}
          >
            Tải lại
          </Button>
          <Button
            color="blue"
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate(content)}
          >
            Lưu thay đổi
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
