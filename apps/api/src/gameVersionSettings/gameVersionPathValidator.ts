import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_GAME_FILES } from './requiredGameFiles.js';

export type GameVersionPathInput = {
  gameVersionPath: string;
  gameVersionSubPath?: string;
};

export type GameVersionValidationResult = {
  isValid: boolean;
  errors: string[];
  missingFiles: string[];
  resolvedPath: string | null;
};

function invalid(errors: string[], missingFiles: string[] = [], resolvedPath: string | null = null): GameVersionValidationResult {
  return { isValid: false, errors, missingFiles, resolvedPath };
}

export function resolveGameVersionTarget(input: GameVersionPathInput): { rootPath: string; targetPath: string } | { error: string } {
  const trimmedRoot = input.gameVersionPath.trim();
  const trimmedSubPath = input.gameVersionSubPath?.trim() ?? '';

  if (!trimmedRoot) {
    return { error: 'Đường dẫn game version không được để trống' };
  }

  if (trimmedRoot.includes('\0') || trimmedSubPath.includes('\0')) {
    return { error: 'Đường dẫn game version không hợp lệ' };
  }

  if (!path.isAbsolute(trimmedRoot)) {
    return { error: 'Đường dẫn game version phải là đường dẫn tuyệt đối' };
  }

  const rootPath = path.resolve(trimmedRoot);
  const targetPath = path.resolve(rootPath, trimmedSubPath || '.');

  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    return { error: 'Đường dẫn con không được thoát khỏi thư mục game version' };
  }

  return { rootPath, targetPath };
}

export function validateGameVersionPath(input: GameVersionPathInput): GameVersionValidationResult {
  const resolved = resolveGameVersionTarget(input);
  if ('error' in resolved) {
    return invalid([resolved.error]);
  }

  const { targetPath } = resolved;

  if (!fs.existsSync(targetPath)) {
    return invalid(['Đường dẫn game version không tồn tại'], [], targetPath);
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return invalid(['Đường dẫn game version phải là thư mục'], [], targetPath);
  }

  try {
    fs.accessSync(targetPath, fs.constants.R_OK);
  } catch {
    return invalid(['Không có quyền đọc thư mục game version'], [], targetPath);
  }

  const missingFiles = REQUIRED_GAME_FILES.filter((requiredFile) => !fs.existsSync(path.join(targetPath, requiredFile)));
  const errors = missingFiles.map((requiredFile) => `Thiếu mục bắt buộc: ${requiredFile}`);

  return { isValid: missingFiles.length === 0, errors, missingFiles, resolvedPath: targetPath };
}
