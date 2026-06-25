import { Box, Card } from '@mantine/core';

export function FileManagerView() {
  const codeServerUrl = `${window.location.protocol}//${window.location.hostname}:8080/`;

  return (
    <Box px="md" pb="md" pt={0} h="100%" display="flex" style={{ flexDirection: 'column' }}>
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
