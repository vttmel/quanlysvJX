import { screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameVersionStartupGuard } from './GameVersionStartupGuard';

afterEach(() => {
  cleanup();
});

const mockUseLocation = vi.fn();
const mockStartupQuery = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useLocation: () => mockUseLocation() };
});

vi.mock('@/hooks/useGameVersionSettings', () => ({
  useGameVersionSettings: () => ({ startupQuery: mockStartupQuery() }),
}));

describe('GameVersionStartupGuard', () => {
  it('renders children on settings route even when startup check fails', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings' });
    mockStartupQuery.mockReturnValue({
      data: {
        configured: false,
        ready: false,
        validation: { errors: ['Chưa cấu hình'], missingFiles: [] },
      },
      isLoading: false,
    });

    renderWithProviders(
      <GameVersionStartupGuard>
        <div>Settings content</div>
      </GameVersionStartupGuard>
    );

    expect(screen.getByText('Settings content')).toBeTruthy();
  });

  it('shows recovery screen on game-dependent route when not ready', () => {
    mockUseLocation.mockReturnValue({ pathname: '/dashboard' });
    mockStartupQuery.mockReturnValue({
      data: {
        configured: true,
        ready: false,
        validation: { errors: ['Đường dẫn không tồn tại'], missingFiles: [] },
      },
      isLoading: false,
    });

    renderWithProviders(
      <GameVersionStartupGuard>
        <div>Dashboard content</div>
      </GameVersionStartupGuard>
    );

    expect(screen.getByText('Không thể tải game version')).toBeTruthy();
    expect(screen.queryByText('Dashboard content')).toBeNull();
  });
});
