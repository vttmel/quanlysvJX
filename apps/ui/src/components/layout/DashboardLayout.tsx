import './Navbar.css';
import {
  AppShell,
  Group,
  NavLink,
  Stack,
  Burger,
  Tooltip,
  ActionIcon,
  Text,
  Code,
  Button,
  Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconSwords,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconClock,
  IconServer,
  IconDatabase,
  IconCpu,
  IconGauge,
  IconDeviceSdCard,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet, Link } from 'react-router-dom';
import { navigationConfig } from '@/configs/routes.config';
import { useSystemInfo } from '@/hooks/useSystemInfo';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';

const navbarCollapsedStorageKey = 'jx-manager-navbar-collapsed';

function readDesktopNavbarOpened() {
  try {
    return window.localStorage.getItem(navbarCollapsedStorageKey) !== 'true';
  } catch {
    return true;
  }
}

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, setDesktopOpened] = useState(readDesktopNavbarOpened);
  const systemInfo = useSystemInfo({ refetchInterval: 30000 });
  const { status, checkNow, isChecking, isLoading } = useUpdateStatus();

  const toggleDesktop = useCallback(() => {
    setDesktopOpened((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(navbarCollapsedStorageKey, String(!next));
      } catch {
        // Ignore storage failures and keep the in-memory toggle usable.
      }
      return next;
    });
  }, []);

  const getActiveKey = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) {
      return 'dashboard';
    }
    if (path.startsWith('/game-accounts')) {
      return 'game-accounts';
    }
    if (path.startsWith('/backup')) {
      return 'backup';
    }
    if (path.startsWith('/file-manager')) {
      return 'file-manager';
    }
    if (path.startsWith('/settings')) {
      return 'settings';
    }
    return 'dashboard';
  };

  const activeKey = getActiveKey();

  return (
    <AppShell
      layout="alt"
      header={{ height: 60 }}
      navbar={{
        width: desktopOpened ? 240 : 80,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <AppShell.Header px="md" style={{ display: 'flex', alignItems: 'center' }}>
        <Group h="100%" justify="space-between" style={{ flex: 1, flexWrap: 'nowrap' }}>
          <Group gap="xs" style={{ flexWrap: 'nowrap' }}>
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Group gap="xs" hiddenFrom="sm" style={{ flexWrap: 'nowrap' }}>
              <IconSwords size={22} color="var(--mantine-color-blue-7)" />
              <Text fw={700} size="md">
                JX Manager
              </Text>
            </Group>
          </Group>
          {systemInfo.data && (
            <Group gap={6} visibleFrom="sm" style={{ flexWrap: 'nowrap' }}>
              <Badge
                variant="light"
                className="glassBadge"
                leftSection={<IconServer size={14} stroke={1.5} />}
                radius="md"
              >
                <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
                  IP server
                </Text>
                {systemInfo.data.serverIp}
              </Badge>
              <Badge
                variant="light"
                className="glassBadge"
                leftSection={<IconDatabase size={14} stroke={1.5} />}
                radius="md"
                visibleFrom="md"
              >
                <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
                  IP MySQL
                </Text>
                {systemInfo.data.mysqlIp}
              </Badge>
              <Badge
                variant="light"
                className="glassBadge"
                leftSection={<IconDatabase size={14} stroke={1.5} />}
                radius="md"
                visibleFrom="md"
              >
                <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
                  Ip MSSQL
                </Text>
                {systemInfo.data.mssqlIp}
              </Badge>
              <Badge
                variant="light"
                className="glassBadge"
                leftSection={<IconCpu size={14} stroke={1.5} />}
                radius="md"
              >
                <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
                  CPU
                </Text>
                {systemInfo.data.cpuUsage}%
              </Badge>
              <Badge
                variant="light"
                className="glassBadge"
                leftSection={<IconGauge size={14} stroke={1.5} />}
                radius="md"
              >
                <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
                  RAM
                </Text>
                <Text span visibleFrom="lg">
                  {systemInfo.data.ramUsed}/{systemInfo.data.ramTotal} GB ({systemInfo.data.ramUsage}%)
                </Text>
                <Text span hiddenFrom="lg">
                  {systemInfo.data.ramUsage}%
                </Text>
              </Badge>
              <Badge
                variant="light"
                className="glassBadge"
                leftSection={<IconDeviceSdCard size={14} stroke={1.5} />}
                radius="md"
              >
                <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
                  Disk
                </Text>
                <Text span visibleFrom="lg">
                  {systemInfo.data.diskUsed}/{systemInfo.data.diskTotal} GB ({systemInfo.data.diskUsage}%)
                </Text>
                <Text span hiddenFrom="lg">
                  {systemInfo.data.diskUsage}%
                </Text>
              </Badge>
              <ServerClockBadge
                serverTime={systemInfo.data.serverTime}
                timezone={systemInfo.data.timezone}
              />
            </Group>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md" className="navbarColored">
        <Stack gap="md" style={{ height: '100%' }}>
          {/* Brand Area */}
          <Group justify="space-between" style={{ width: '100%', flexWrap: 'nowrap' }} px={desktopOpened ? 'xs' : 0}>
            {desktopOpened ? (
              <Group gap="xs" style={{ flexWrap: 'nowrap' }}>
                <IconSwords size={22} color="var(--mantine-color-blue-3)" />
                <Stack gap={0}>
                  <Text fw={700} size="md" c="white" style={{ lineHeight: 1.2 }}>
                    JX Manager
                  </Text>
                  <Group gap={4} style={{ flexWrap: 'nowrap', marginTop: '2px' }}>
                    <Code style={{ 
                      fontWeight: 'bold', 
                      fontSize: '10px', 
                      padding: '1px 5px', 
                      backgroundColor: 'rgba(255,255,255,0.18)', 
                      color: '#fff',
                      borderRadius: '4px'
                    }}>
                      {status?.currentVersion || '...'}
                    </Code>
                    <Tooltip label="Kiểm tra cập nhật">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="xs"
                        loading={isChecking || isLoading}
                        onClick={() => void checkNow()}
                        styles={{ root: { color: 'rgba(255,255,255,0.7)', minWidth: '16px', minHeight: '16px' } }}
                      >
                        <IconRefresh size={10} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    {status?.hasUpdate && (
                      <Button
                        component={Link}
                        to="/settings/system"
                        size="xs"
                        color="orange"
                        variant="filled"
                        styles={{
                          root: {
                            paddingLeft: '4px',
                            paddingRight: '4px',
                            height: '16px',
                            fontSize: '9px',
                            minHeight: '16px',
                          },
                        }}
                      >
                        Cập nhật
                      </Button>
                    )}
                  </Group>
                </Stack>
              </Group>
            ) : (
              <Group justify="center" style={{ width: '100%' }}>
                <IconSwords size={22} color="var(--mantine-color-blue-3)" />
              </Group>
            )}
          </Group>

          {/* Toggle Area of Navbar */}
          <Group
            justify={desktopOpened ? 'flex-end' : 'center'}
            style={{ width: '100%', paddingBottom: '10px' }}
          >
            <ActionIcon
              className="navbarToggleBtn"
              aria-label={desktopOpened ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
              onClick={toggleDesktop}
              visibleFrom="sm"
              size="lg"
            >
              {desktopOpened ? <IconChevronLeft size={20} /> : <IconChevronRight size={20} />}
            </ActionIcon>
          </Group>

          {/* Navigation Links */}
          <Stack gap="xs" style={{ flex: 1 }}>
            {navigationConfig.map((item) => {
              const Icon = item.icon;
              const isActive = activeKey === item.key;
              const navLink = (
                <NavLink
                  key={item.key}
                  label={desktopOpened ? item.title : ''}
                  leftSection={<Icon size={20} />}
                  active={isActive}
                  onClick={() => {
                    navigate(item.path);
                    if (mobileOpened) {
                      toggleMobile();
                    }
                  }}
                  className={`navLinkColored ${isActive ? 'navLinkColoredActive' : ''} ${
                    !desktopOpened ? 'navLinkCollapsed' : ''
                  }`}
                />
              );

              return desktopOpened ? (
                navLink
              ) : (
                <Tooltip key={item.key} label={item.title} position="right" withArrow>
                  <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                    {navLink}
                  </div>
                </Tooltip>
              );
            })}
          </Stack>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-gray-0)">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

function ServerClockBadge({ serverTime, timezone }: { serverTime?: string; timezone?: string }) {
  const clock = useServerClock(serverTime);
  return (
    <Badge
      variant="light"
      className="glassBadge"
      leftSection={<IconClock size={14} stroke={1.5} />}
      radius="md"
    >
      <Text span fw={700} style={{ marginRight: '5px' }} visibleFrom="lg">
        Time server
      </Text>
      {formatServerTime(clock, timezone)}
    </Badge>
  );
}

function useServerClock(serverTime?: string) {
  const [clock, setClock] = useState<Date | null>(null);

  useEffect(() => {
    if (!serverTime) {
      setClock(null);
      return undefined;
    }

    const baseServerMs = Date.parse(serverTime);
    if (Number.isNaN(baseServerMs)) {
      setClock(null);
      return undefined;
    }

    const receivedAtMs = Date.now();
    const tick = () => setClock(new Date(baseServerMs + Date.now() - receivedAtMs));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [serverTime]);

  return clock;
}

function formatServerTime(date: Date | null, timezone?: string) {
  if (!date || Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: timezone,
  });
}
