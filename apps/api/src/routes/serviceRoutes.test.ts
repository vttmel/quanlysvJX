import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';

let root: string;

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

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'service-routes-'));
  mkdirSync(path.join(root, 'apps/jx-services/versions/mel/server'), { recursive: true });
  writeFileSync(path.join(root, '.env'), `SERVER_PATH=${path.resolve(root, 'apps/jx-services/versions/mel/server')}/\n`, 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('service routes', () => {
  it('returns normalized service list', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async (args) => {
        calls.push([...args]);
        return {
          stdout: JSON.stringify([{ Service: 'jxmysql', Name: 'jxmysql', State: 'running' }]),
          stderr: '',
          exitCode: 0
        };
      }
    });

    const response = await app.inject({ method: 'GET', url: '/api/services' });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([['ps', '--all', '--format', 'json']]);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data).toHaveLength(8);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'jxmysql', state: 'running' }),
        expect.objectContaining({ name: 'jxmssql', state: 'not created' }),
        expect.objectContaining({ name: 'paysys', state: 'not created' })
      ])
    );
  });

  it('rejects unknown service actions', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'POST', url: '/api/services/not-real/start' });

    expect(response.statusCode).toBe(400);
  });

  it('runs start through docker compose up with an allowlisted service', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    const response = await app.inject({ method: 'POST', url: '/api/services/jxmysql/start' });

    expect(response.statusCode).toBe(200);
    expect(calls).toEqual([['up', '-d', 'jxmysql']]);
  });

  it('returns docker error details when a service action fails', async () => {
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: '', stderr: 'dependency failed healthcheck\nextra detail', exitCode: 1 })
    });

    const response = await app.inject({ method: 'POST', url: '/api/services/paysys/start' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      success: false,
      error: 'Started paysys failed: dependency failed healthcheck\nextra detail'
    });
  });
});
