import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { SelfUpdatePanel } from './SelfUpdatePanel';

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
    streamUpdate: vi.fn(),
  }),
}));

describe('SelfUpdatePanel', () => {
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
});
