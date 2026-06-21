import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameVersionSettingsPanel } from './GameVersionSettingsPanel';

afterEach(() => {
  cleanup();
});

const mockValidateSettings = vi.fn();
const mockSaveSettings = vi.fn();

vi.mock('@/hooks/useGameVersionSettings', () => ({
  useGameVersionSettings: () => ({
    settingsQuery: {
      data: {
        gameVersionPath: '/srv/game',
        gameVersionSubPath: '',
        requiredFiles: ['goddes_y', 'bishop_y', 'server', 'gateway'],
        validation: {
          isValid: false,
          errors: ['Thiếu mục bắt buộc: goddes_y'],
          missingFiles: ['goddes_y'],
        },
      },
      isLoading: false,
    },
    validateMutation: { mutateAsync: mockValidateSettings, isPending: false, data: undefined },
    saveMutation: { mutateAsync: mockSaveSettings, isPending: false },
  }),
}));

describe('GameVersionSettingsPanel', () => {
  it('validates and saves selected path', async () => {
    mockValidateSettings.mockResolvedValueOnce({
      validation: { isValid: true, errors: [], missingFiles: [] },
    });
    mockSaveSettings.mockResolvedValueOnce({
      validation: { isValid: true, errors: [], missingFiles: [] },
    });

    renderWithProviders(<GameVersionSettingsPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Đường dẫn game version'), {
      target: { value: '/srv/game' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu cài đặt' }));

    await waitFor(() =>
      expect(mockSaveSettings).toHaveBeenCalledWith({
        gameVersionPath: '/srv/game',
        gameVersionSubPath: '',
      })
    );
  });

  it('shows required files and current validation errors', () => {
    renderWithProviders(<GameVersionSettingsPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(screen.getAllByText('goddes_y').length).toBeGreaterThan(0);
    expect(screen.getByText('Thiếu mục bắt buộc: goddes_y')).toBeTruthy();
  });
});
