import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { SelfUpdatePanel } from './SelfUpdatePanel';

const mocks = vi.hoisted(() => ({
  streamUpdate: vi.fn(),
}));

vi.mock('@/hooks/useUpdateStatus', () => ({
  useUpdateStatus: () => ({
    status: {
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      latestVersion: 'v1.1.0',
      latestTag: 'v1.1.0',
      releaseUrl: 'url',
      releaseNotes: 'Notes',
      hasUpdate: true,
      repoDirty: false,
      checkedAt: '2026-06-24T10:00:00.000Z',
    },
    isLoading: false,
    checkNow: vi.fn(),
    isChecking: false,
    streamUpdate: mocks.streamUpdate,
  }),
}));

describe('SelfUpdatePanel', () => {
  beforeEach(() => {
    mocks.streamUpdate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows update button when a newer release exists', () => {
    renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });
    expect(screen.getByText('v1.0.0')).toBeTruthy();
    expect(screen.getByText('v1.1.0')).toBeTruthy();
    expect((screen.getByRole('button', { name: /cập nhật/i }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('keeps waiting instead of reporting error when SSE disconnects during restart', () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    mocks.streamUpdate.mockImplementation((handlers) => {
      handlers.onEvent({ type: 'restarting', message: 'Đang khởi động lại' });
      handlers.onError('Mất kết nối khi cập nhật');
    });

    renderWithProviders(<SelfUpdatePanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings',
    });
    fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

    expect(onSuccess).toHaveBeenCalledWith('Đang khởi động lại JX Manager');
    expect(onError).not.toHaveBeenCalled();
    expect(
      screen.getByText('API/UI đang khởi động lại. Trang sẽ tự tải lại khi API sẵn sàng.')
    ).toBeTruthy();
  });
});
