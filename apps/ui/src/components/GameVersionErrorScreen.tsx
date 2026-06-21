import { Alert, Button, Container, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

type Props = {
  errors: string[];
};

export function GameVersionErrorScreen({ errors }: Props) {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="md">
        <IconAlertTriangle size={48} color="var(--mantine-color-red-6)" />
        <Title order={2} ta="center">Không thể tải game version</Title>
        <Alert color="red" title="Chi tiết lỗi" w="100%">
          <Stack gap={4}>{errors.map((error) => <Text key={error} size="sm">{error}</Text>)}</Stack>
        </Alert>
        <Button component={Link} to="/settings">Mở cài đặt</Button>
      </Stack>
    </Container>
  );
}
