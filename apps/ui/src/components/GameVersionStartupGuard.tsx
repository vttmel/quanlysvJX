import type { ReactNode } from 'react';
import { Container, Loader, Stack, Text } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { useGameVersionSettings } from '@/hooks/useGameVersionSettings';
import { GameVersionErrorScreen } from './GameVersionErrorScreen';

const RECOVERY_ROUTES = ['/settings'];

function isRecoveryRoute(pathname: string) {
  return RECOVERY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function GameVersionStartupGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { startupQuery } = useGameVersionSettings();

  if (isRecoveryRoute(location.pathname)) {
    return <>{children}</>;
  }

  if (startupQuery.isLoading) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md"><Loader /><Text>Đang kiểm tra game version...</Text></Stack>
      </Container>
    );
  }

  if (startupQuery.data && !startupQuery.data.ready) {
    return <GameVersionErrorScreen errors={startupQuery.data.validation.errors} />;
  }

  return <>{children}</>;
}
