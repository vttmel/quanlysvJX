import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';

let root: string;
let gameRoot: string;

function testConfig(projectRoot: string): ManagerConfig {
  return {
    projectRoot,
    mysqlBackupDir: path.join(projectRoot, 'mysql'),
    mssqlBackupDir: path.join(projectRoot, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(projectRoot, 'backup-metadata.json'),
    backupScheduleFile: path.join(projectRoot, 'backup-schedules.json'),
    schedulerEnabled: false,
    mssql: { host: 'localhost', port: 1433, database: 'account_tong', user: null, password: null, encrypt: false, trustServerCertificate: true }
  };
}

function createRequiredEntries(base: string) {
  mkdirSync(path.join(base, 'gateway/s3relay'), { recursive: true });
  mkdirSync(path.join(base, 'server1'), { recursive: true });
  writeFileSync(path.join(base, 'gateway/goddess_y'), '');
  writeFileSync(path.join(base, 'gateway/bishop_y'), '');
  writeFileSync(path.join(base, 'gateway/s3relay/s3relay_y'), '');
  writeFileSync(path.join(base, 'server1/jx_linux_y'), '');
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'game-version-routes-'));
  gameRoot = path.join(root, 'game-version');
  mkdirSync(gameRoot, { recursive: true });
  mkdirSync(path.join(root, 'apps/jx-services'), { recursive: true });
  writeFileSync(path.join(root, 'apps/jx-services/.env'), 'EXISTING=1\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('game version settings routes', () => {
  it('validates a candidate path without saving it', async () => {
    createRequiredEntries(gameRoot);
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/game-version-settings/validate',
      payload: { gameVersionPath: gameRoot, gameVersionSubPath: '' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.validation.isValid).toBe(true);
    expect(readFileSync(path.join(root, 'apps/jx-services/.env'), 'utf8')).toBe('EXISTING=1\n');
  });

  it('saves valid settings and preserves existing env keys', async () => {
    createRequiredEntries(gameRoot);
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/game-version-settings',
      payload: { gameVersionPath: gameRoot, gameVersionSubPath: '' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.validation.isValid).toBe(true);
    expect(readFileSync(path.join(root, 'apps/jx-services/.env'), 'utf8')).toBe(`EXISTING=1\nGAME_VERSION_PATH=${gameRoot}\n`);
  });

  it('rejects invalid settings without changing env', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/game-version-settings',
      payload: { gameVersionPath: gameRoot, gameVersionSubPath: '' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Đường dẫn game version không hợp lệ');
    expect(readFileSync(path.join(root, 'apps/jx-services/.env'), 'utf8')).toBe('EXISTING=1\n');
  });

  it('reports startup check as not configured when env has no path', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/game-version-settings/startup-check' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ configured: false, ready: false, settingsUrl: '/settings' });
  });
});
