import path from 'node:path';
import type { EnvRepository } from '../repositories/envRepository.js';
import { patchGameVersionEnv, readGameVersionEnv } from '../gameVersionSettings/gameVersionEnv.js';
import { getRequiredGameFiles } from '../gameVersionSettings/requiredGameFiles.js';
import { validateGameVersionPath, type GameVersionValidationResult } from '../gameVersionSettings/gameVersionPathValidator.js';
import { ValidationError } from '../utils/errors.js';

export type GameVersionSettingsPayload = {
  gameVersionPath: string;
  gameVersionSubPath?: string;
};

export type GameVersionSettingsResponse = {
  gameVersionPath: string;
  gameVersionSubPath: string;
  requiredFiles: readonly string[];
  validation: GameVersionValidationResult;
};

export type GameVersionStartupCheck = {
  configured: boolean;
  ready: boolean;
  settingsUrl: '/settings';
  validation: GameVersionValidationResult;
};

export class GameVersionSettingsService {
  constructor(private readonly envRepository: EnvRepository) {}

  getSettings(): GameVersionSettingsResponse {
    const content = this.envRepository.exists() ? this.envRepository.read() : '';
    const values = readGameVersionEnv(content);
    return this.buildResponse(values);
  }

  validateSettings(payload: GameVersionSettingsPayload): GameVersionSettingsResponse {
    return this.buildResponse({
      gameVersionPath: payload.gameVersionPath,
      gameVersionSubPath: payload.gameVersionSubPath ?? ''
    });
  }

  saveSettings(payload: GameVersionSettingsPayload): GameVersionSettingsResponse {
    const response = this.validateSettings(payload);
    if (!response.validation.isValid) {
      throw new ValidationError(`Đường dẫn game version không hợp lệ: ${response.validation.errors.join('; ')}`);
    }

    const content = this.envRepository.exists() ? this.envRepository.read() : '';
    const nextContent = patchGameVersionEnv(content, {
      gameVersionPath: response.gameVersionPath,
      gameVersionSubPath: response.gameVersionSubPath
    });
    this.envRepository.write(nextContent);

    return response;
  }

  startupCheck(): GameVersionStartupCheck {
    const settings = this.getSettings();
    const configured = settings.gameVersionPath.trim().length > 0;
    return {
      configured,
      ready: configured && settings.validation.isValid,
      settingsUrl: '/settings',
      validation: settings.validation
    };
  }

  private buildResponse(values: { gameVersionPath: string; gameVersionSubPath: string }): GameVersionSettingsResponse {
    const rootPath = values.gameVersionPath.trim();
    const subPath = values.gameVersionSubPath.trim();

    const normalized = {
      gameVersionPath: rootPath ? path.resolve(rootPath) : '',
      gameVersionSubPath: subPath
    };

    const validation = rootPath
      ? validateGameVersionPath(normalized)
      : { isValid: false, errors: ['Chưa cấu hình đường dẫn game version'], missingFiles: [], resolvedPath: null };

    return {
      ...normalized,
      requiredFiles: getRequiredGameFiles(),
      validation
    };
  }
}
