import { AppShell, Group, MantineProvider, Text, Title } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

export function App() {
  return (
    <MantineProvider defaultColorScheme="auto">
      <Notifications />
      <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header px="md">
          <Group h="100%" justify="space-between">
            <Title order={3}>JX Compose Manager</Title>
            <Text size="sm" c="dimmed">docker-compose.yaml</Text>
          </Group>
        </AppShell.Header>
        <AppShell.Main>
          <Text>Manager dashboard is ready.</Text>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
