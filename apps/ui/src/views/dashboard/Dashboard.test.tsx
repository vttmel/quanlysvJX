import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import Dashboard from './index';

const mockUseServices = vi.fn();
const mockUseVersions = vi.fn();
const mockUseSystemInfo = vi.fn();

vi.mock('@/hooks/useServices', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
  serviceKeys: {
    all: ['services'] as const,
    lists: () => ['services', 'list'] as const,
    logs: (service: string, tail: number) => ['services', 'logs', service, { tail }] as const,
  },
}));

vi.mock('@/hooks/useVersions', () => ({
  useVersions: () => mockUseVersions(),
  versionKeys: {
    all: ['versions'] as const,
    lists: () => ['versions', 'list'] as const,
    browse: (name: string, path?: string) => ['versions', 'browse', name, { path }] as const,
  },
}));

vi.mock('@/hooks/useSystemInfo', () => ({
  useSystemInfo: () => mockUseSystemInfo(),
  useSaveGameNetwork: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/services/serviceService', () => ({
  serviceService: {
    getLogs: vi.fn().mockResolvedValue({ service: 'all', tail: 300, logs: '' }),
    logStreamUrl: vi.fn(() => '/api/services/all/logs/stream?tail=0'),
  },
}));

class MockEventSource {
  close = vi.fn();
  constructor(public readonly url: string) {}
  addEventListener() {
    return undefined;
  }
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
    mockUseVersions.mockReturnValue({
      versionsData: { activeVersion: 'mel', versions: [] },
      isLoading: false,
      selectVersion: vi.fn(),
      deleteVersion: vi.fn(),
      renameVersion: vi.fn(),
    });
    mockUseSystemInfo.mockReturnValue({
      data: {
        rawJxIp: '192.168.1.100',
        ipChoices: ['192.168.1.100'],
      },
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockUseServices.mockReset();
    mockUseVersions.mockReset();
    mockUseSystemInfo.mockReset();
  });

  it('shows a game version warning when versions load without an active version', async () => {
    mockUseServices.mockReturnValue({
      services: [],
      isFetching: false,
      error: null,
      isError: false,
      runAction: vi.fn(),
      isActionLoading: false,
    });
    mockUseVersions.mockReturnValue({
      versionsData: { activeVersion: null, versions: [] },
      isLoading: false,
      selectVersion: vi.fn(),
      deleteVersion: vi.fn(),
      renameVersion: vi.fn(),
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Cảnh báo: Chưa có Phiên bản Game')).toBeTruthy();
    expect(screen.getByText(/kích hoạt một phiên bản/)).toBeTruthy();
  });

  it('shows a game version warning when services cannot load because no version is active', async () => {
    mockUseServices.mockReturnValue({
      services: [],
      isFetching: false,
      error: new Error(
        'Chưa có phiên bản game nào được kích hoạt. Vui lòng kích hoạt một phiên bản trước.'
      ),
      isError: true,
      runAction: vi.fn(),
      isActionLoading: false,
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Cảnh báo: Chưa có Phiên bản Game')).toBeTruthy();
    expect(screen.getByText(/Vui lòng vào Quản lý phiên bản game/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở quản lý phiên bản' }).getAttribute('href')).toBe(
      '/settings/versions'
    );
  });

  it('shows an IP warning when raw JX_IP does not match any server IP choices', async () => {
    mockUseServices.mockReturnValue({
      services: [],
      isFetching: false,
      error: null,
      isError: false,
      runAction: vi.fn(),
      isActionLoading: false,
    });
    mockUseSystemInfo.mockReturnValue({
      data: {
        rawJxIp: '1.2.3.4',
        ipChoices: ['192.168.1.100'],
      },
      isLoading: false,
    });

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText('Cảnh báo: Cấu hình IP Game không hợp lệ')).toBeTruthy();
    expect(screen.getByText(/IP cấu hình game hiện tại \(1.2.3.4\)/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cấu hình IP' }).getAttribute('href')).toBe(
      '/settings/versions'
    );
  });
});
