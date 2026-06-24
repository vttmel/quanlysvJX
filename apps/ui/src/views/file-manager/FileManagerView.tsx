import { Box, Card, Group, Title } from '@mantine/core';
import { IconFileCode } from '@tabler/icons-react';

export function FileManagerView() {
  return (
    <Box p="md" h="100%" display="flex" style={{ flexDirection: 'column' }}>
      <Group mb="md">
        <Title order={2} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconFileCode size={28} />
          Quản lý File
        </Title>
      </Group>

      <Card
        shadow="sm"
        padding="0"
        radius="md"
        withBorder
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <iframe
          src="/filebrowser/"
          style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
          title="File Browser"
          allowFullScreen
        />
      </Card>
    </Box>
  );
}
