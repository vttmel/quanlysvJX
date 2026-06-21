import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateGameVersionPath } from './gameVersionPathValidator.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'game-version-settings-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function createRequiredEntries(base: string) {
  writeFileSync(path.join(base, 'goddes_y'), '');
  writeFileSync(path.join(base, 'bishop_y'), '');
  mkdirSync(path.join(base, 'server'));
  mkdirSync(path.join(base, 'gateway'));
}

describe('validateGameVersionPath', () => {
  it('rejects empty paths', () => {
    const result = validateGameVersionPath({ gameVersionPath: '' });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Đường dẫn game version không được để trống');
  });

  it('rejects relative paths', () => {
    const result = validateGameVersionPath({ gameVersionPath: './versions/mel' });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Đường dẫn game version phải là đường dẫn tuyệt đối');
  });

  it('rejects missing required entries', () => {
    const result = validateGameVersionPath({ gameVersionPath: root });

    expect(result.isValid).toBe(false);
    expect(result.missingFiles).toEqual(['goddes_y', 'bishop_y', 'server', 'gateway']);
  });

  it('accepts all required entries at root path', () => {
    createRequiredEntries(root);

    const result = validateGameVersionPath({ gameVersionPath: root });

    expect(result).toMatchObject({ isValid: true, errors: [], missingFiles: [] });
  });

  it('accepts required entries under safe sub path', () => {
    const target = path.join(root, 'release/server-files');
    mkdirSync(target, { recursive: true });
    createRequiredEntries(target);

    const result = validateGameVersionPath({ gameVersionPath: root, gameVersionSubPath: 'release/server-files' });

    expect(result).toMatchObject({ isValid: true, errors: [], missingFiles: [] });
  });

  it('rejects sub paths that escape root', () => {
    const result = validateGameVersionPath({ gameVersionPath: root, gameVersionSubPath: '../outside' });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Đường dẫn con không được thoát khỏi thư mục game version');
  });
});
