import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateVersionError,
  createVersionRecord,
  ensureVersionRegistry,
  getVersionsDir,
  readVersionRegistry,
  renameVersion,
  selectVersion
} from './versionRegistry.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'version-registry-'));
  mkdirSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true });
  writeFileSync(path.join(root, '.env'), 'SERVER_PATH=./apps/jx-services/versions/mel/server/\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('version registry', () => {
  it('bootstraps versions.json from existing version folders', () => {
    const registry = ensureVersionRegistry(root);

    expect(registry.activeVersion).toBe('mel');
    expect(registry.versions).toHaveLength(1);
    expect(registry.versions[0]).toMatchObject({
      name: 'mel',
      path: path.resolve(root, 'apps/jx-services/versions/mel/server')
    });
    expect(Date.parse(registry.versions[0]?.uploadedAt ?? '')).not.toBeNaN();

    const saved = JSON.parse(readFileSync(path.join(getVersionsDir(root), 'versions.json'), 'utf8'));
    expect(saved.activeVersion).toBe('mel');
  });

  it('preserves the active SERVER_PATH even when the subfolder is not present yet', () => {
    rmSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true, force: true });

    const registry = ensureVersionRegistry(root);

    expect(registry.versions[0]?.path).toBe(path.resolve(root, 'apps/jx-services/versions/mel/server'));
  });

  it('rejects duplicate names from registry or folders', () => {
    ensureVersionRegistry(root);
    expect(() => createVersionRecord(root, { name: 'mel', source: 'upload' })).toThrow(DuplicateVersionError);

    mkdirSync(path.join(getVersionsDir(root), 'new_ver'), { recursive: true });
    expect(() => createVersionRecord(root, { name: 'new_ver', source: 'upload' })).toThrow(DuplicateVersionError);
  });

  it('adds a new version record with uploadedAt and default server folder', () => {
    ensureVersionRegistry(root);
    const record = createVersionRecord(root, { name: 'new_ver', source: 'upload' });
    const registry = readVersionRegistry(root);

    expect(record).toMatchObject({
      name: 'new_ver',
      path: path.resolve(root, 'apps/jx-services/versions/new_ver')
    });
    expect(Date.parse(record.uploadedAt)).not.toBeNaN();
    expect(registry.versions.map((version) => version.name)).toEqual(['mel', 'new_ver']);
  });

  it('selects a version and synchronizes SERVER_PATH', () => {
    ensureVersionRegistry(root);
    createVersionRecord(root, { name: 'new_ver', source: 'upload' });
    mkdirSync(path.join(getVersionsDir(root), 'new_ver/server'), { recursive: true });

    const result = selectVersion(root, 'new_ver');

    expect(result.activeVersion).toBe('new_ver');
    expect(result.serverPath).toBe(path.resolve(root, 'apps/jx-services/versions/new_ver') + '/');
    expect(readVersionRegistry(root).activeVersion).toBe('new_ver');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('SERVER_PATH=' + path.resolve(root, 'apps/jx-services/versions/new_ver') + '/');
  });

  it('renames an active version folder and keeps SERVER_PATH synchronized', () => {
    ensureVersionRegistry(root);
    const oldStat = statSync(path.join(getVersionsDir(root), 'mel'));

    const renamed = renameVersion(root, 'mel', { name: 'mel_2026' });

    expect(renamed).toMatchObject({
      name: 'mel_2026',
      path: path.resolve(root, 'apps/jx-services/versions/mel_2026/server')
    });
    expect(statSync(path.join(getVersionsDir(root), 'mel_2026')).mtimeMs).toBeGreaterThanOrEqual(oldStat.mtimeMs);
    expect(readVersionRegistry(root).activeVersion).toBe('mel_2026');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('SERVER_PATH=' + path.resolve(root, 'apps/jx-services/versions/mel_2026/server') + '/');
  });
});
