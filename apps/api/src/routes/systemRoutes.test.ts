import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  root = mkdtempSync(path.join(tmpdir(), 'system-routes-'));
  writeFileSync(root + '/.env', 'JX_IP=auto\nJX_MYSQL_IP=auto\nJX_PAYSYS_IP=auto\nJX_MSSQL_IP=auto\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('system routes', () => {
  it('returns system info with explicit fallback instead of auto', async () => {
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: JSON.stringify([{ Service: 'jxserver', State: 'running' }]), stderr: '', exitCode: 0 })
    });

    const response = await app.inject({ method: 'GET', url: '/api/system/info' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      serverIp: '127.0.0.1',
      mysqlIp: '127.0.0.1',
      mssqlIp: '127.0.0.1',
      coreServicesRunning: true,
      runningCoreServices: ['jxserver']
    });
    expect(response.json().data.ipChoices).toContain('127.0.0.1');
  });

  it('saves game network values to env and rejects auto', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const badResponse = await app.inject({
      method: 'PUT',
      url: '/api/system/game-network',
      payload: { jxIp: 'auto', mysqlIp: '127.0.0.1', paysysIp: '127.0.0.1', mssqlIp: '127.0.0.1' }
    });
    expect(badResponse.statusCode).toBe(400);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/system/game-network',
      payload: { jxIp: '127.0.0.1', mysqlIp: '127.0.0.1', paysysIp: '127.0.0.1', mssqlIp: '127.0.0.1' }
    });

    expect(response.statusCode).toBe(200);
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('JX_IP=127.0.0.1');
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toContain('JX_MSSQL_IP=127.0.0.1');
  });
});
