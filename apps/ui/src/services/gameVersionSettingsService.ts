import ApiService from './base/apiService';

export type GameVersionValidation = {
  isValid: boolean;
  errors: string[];
  missingFiles: string[];
  resolvedPath?: string | null;
};

export type GameVersionSettingsPayload = {
  gameVersionPath: string;
  gameVersionSubPath: string;
};

export type GameVersionSettings = GameVersionSettingsPayload & {
  requiredFiles: string[];
  validation: GameVersionValidation;
};

export type GameVersionStartupCheck = {
  configured: boolean;
  ready: boolean;
  settingsUrl: '/settings';
  validation: GameVersionValidation;
};

export const gameVersionSettingsService = {
  getSettings: async () => {
    const res = await ApiService.fetchData<any, GameVersionSettings>({ url: '/api/game-version-settings', method: 'GET' });
    return res.data;
  },
  validateSettings: async (data: GameVersionSettingsPayload) => {
    const res = await ApiService.fetchData<any, GameVersionSettings>({ url: '/api/game-version-settings/validate', method: 'POST', data });
    return res.data;
  },
  saveSettings: async (data: GameVersionSettingsPayload) => {
    const res = await ApiService.fetchData<any, GameVersionSettings>({ url: '/api/game-version-settings', method: 'PUT', data });
    return res.data;
  },
  startupCheck: async () => {
    const res = await ApiService.fetchData<any, GameVersionStartupCheck>({ url: '/api/game-version-settings/startup-check', method: 'GET' });
    return res.data;
  }
};
