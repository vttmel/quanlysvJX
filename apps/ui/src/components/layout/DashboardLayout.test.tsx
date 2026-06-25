import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import DashboardLayout from './DashboardLayout';

vi.mock('@/services/systemService', () => ({
  systemService: {
    getSystemInfo: vi.fn().mockResolvedValue({
      serverTime: '2026-06-11T08:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      ipChoices: ['127.0.0.1', '192.168.1.20'],
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      },
      coreServicesRunning: false,
      runningCoreServices: [],
      cpuUsage: 12.5,
      ramUsage: 45.8,
      ramUsed: 3.6,
      ramTotal: 8.0,
      diskUsage: 35.0,
      diskUsed: 42.0,
      diskTotal: 120.0,
    }),
  },
}));

vi.mock('@/hooks/useUpdateStatus', () => ({
  useUpdateStatus: () => ({
    status: {
      currentVersion: 'v1.0.0',
      latestVersion: 'v1.1.0',
      hasUpdate: true,
      repoDirty: false,
    },
    isLoading: false,
    checkNow: vi.fn(),
    isChecking: false,
  }),
}));

describe('DashboardLayout navbar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('persists the desktop collapsed state across renders', () => {
    const firstRender = renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }));

    expect(window.localStorage.getItem('jx-manager-navbar-collapsed')).toBe('true');
    firstRender.unmount();

    renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

    expect(screen.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toBeTruthy();
  });

  it('shows server time and IP summary in the header', async () => {
    renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

    expect(await screen.findByText('Time server')).toBeTruthy();
    expect(screen.getAllByText(/192\.168\.1\.20/).length).toBeGreaterThan(0);
    expect(screen.queryByText('IP MySQL')).toBeNull();
    expect(screen.queryByText('Ip MSSQL')).toBeNull();
  });

  it('shows version tag and update action in the header when update is available', async () => {
    renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

    expect(screen.getByText('v1.0.0')).toBeTruthy();
    expect(screen.getByRole('link', { name: /cập nhật/i })).toBeTruthy();
  });
});
