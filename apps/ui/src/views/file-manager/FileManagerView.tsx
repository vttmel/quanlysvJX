import { Box, Card, Group, Title, Button } from '@mantine/core';
import { IconFileCode, IconExternalLink } from '@tabler/icons-react';

export function FileManagerView() {
  const codeServerUrl = `${window.location.protocol}//${window.location.hostname}:8080/`;

  return (
    <Box p="md" h="100%" display="flex" style={{ flexDirection: 'column' }}>
      <Group mb="md" justify="space-between">
        <Title order={2} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconFileCode size={28} />
          Quản lý File
        </Title>
        <Button
          component="a"
          href={codeServerUrl}
          target="_blank"
          leftSection={<IconExternalLink size={16} />}
          variant="light"
        >
          Mở trong tab mới
        </Button>
      </Group>

      <Card
        shadow="sm"
        padding="0"
        radius="md"
        withBorder
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <iframe
          src={codeServerUrl}
          style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
          title="Code Editor"
          allowFullScreen
        />
      </Card>
    </Box>
  );
}
