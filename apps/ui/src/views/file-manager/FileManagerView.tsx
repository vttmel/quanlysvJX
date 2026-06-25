import { Box } from '@mantine/core';

export function FileManagerView() {
  const codeServerUrl = `${window.location.protocol}//${window.location.hostname}:8080/`;

  return (
    <Box
      style={{
        margin: 'calc(-1 * var(--app-shell-padding, 16px))',
        height: 'calc(100vh - var(--app-shell-header-offset, 60px))',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <iframe
        src={codeServerUrl}
        style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
        title="Code Editor"
        allowFullScreen
      />
    </Box>
  );
}
