import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { UpdateBanner } from './UpdateBanner';

vi.mock('@/hooks/useUpdateStatus', () => ({
  useUpdateStatus: () => ({
    status: {
      currentVersion: 'v1.0.0',
      latestVersion: 'v1.1.0',
      hasUpdate: true,
      repoDirty: false,
    },
    isLoading: false,
  }),
}));

describe('UpdateBanner', () => {
  it('shows release update link', () => {
    renderWithProviders(<UpdateBanner />, { route: '/' });
    expect(screen.getByText(/có bản cập nhật/i)).toBeTruthy();
    expect(
      (screen.getByRole('link', { name: /mở cài đặt/i }) as HTMLAnchorElement).getAttribute('href')
    ).toBe('/settings/system');
  });
});
