import { describe, expect, it, vi } from 'vitest';
import ApiService from './base/apiService';
import { gameVersionSettingsService } from './gameVersionSettingsService';

vi.mock('./base/apiService', () => ({
  default: { fetchData: vi.fn() }
}));

describe('gameVersionSettingsService', () => {
  it('calls startup check endpoint', async () => {
    vi.mocked(ApiService.fetchData).mockResolvedValueOnce({ data: { configured: false, ready: false, settingsUrl: '/settings', validation: { isValid: false, errors: [], missingFiles: [] } } } as any);

    const result = await gameVersionSettingsService.startupCheck();

    expect(ApiService.fetchData).toHaveBeenCalledWith({ url: '/api/game-version-settings/startup-check', method: 'GET' });
    expect(result.ready).toBe(false);
  });

  it('saves settings with PUT', async () => {
    vi.mocked(ApiService.fetchData).mockResolvedValueOnce({ data: { gameVersionPath: '/srv/game', gameVersionSubPath: '', requiredFiles: [], validation: { isValid: true, errors: [], missingFiles: [] } } } as any);

    await gameVersionSettingsService.saveSettings({ gameVersionPath: '/srv/game', gameVersionSubPath: '' });

    expect(ApiService.fetchData).toHaveBeenCalledWith({
      url: '/api/game-version-settings',
      method: 'PUT',
      data: { gameVersionPath: '/srv/game', gameVersionSubPath: '' }
    });
  });
});
