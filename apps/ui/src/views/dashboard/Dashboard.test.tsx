import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import Dashboard from './index';

const mockUseServices = vi.fn();

vi.mock('@/hooks/useServices', () => ({
  useServices: (...args: unknown[]) => mockUseServices(...args),
  serviceKeys: {
    all: ['services'] as const,
    lists: () => ['services', 'list'] as const,
    logs: (service: string, tail: number) => ['services', 'logs', service, { tail }] as const,
  },
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mockUseServices.mockReset();
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
      '/settings'
    );
  });
});
