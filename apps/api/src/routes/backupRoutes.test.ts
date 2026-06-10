import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';

function testConfig(root: string): ManagerConfig {
  return {
    projectRoot: root,
    mysqlBackupDir: path.join(root, 'mysql'),
    mssqlBackupDir: path.join(root, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(root, 'backup-metadata.json'),
    backupScheduleFile: path.join(root, 'backup-schedules.json'),
    schedulerEnabled: false
  };
}

describe('backup routes', () => {
  it('starts mysql backup job', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({
      config: testConfig(root),
      runCompose: async () => ({ stdout: 'CREATE DATABASE server1;\n', stderr: '', exitCode: 0 })
    });

    const response = await app.inject({ method: 'POST', url: '/api/backups/mysql' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.kind).toBe('mysql');
  });

  it('lists managed backup files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/backups' });

    expect(app.deps.config.backupMetadataFile.endsWith('backup-metadata.json')).toBe(true);
    expect(app.deps.config.backupScheduleFile.endsWith('backup-schedules.json')).toBe(true);
    expect(app.deps.config.schedulerEnabled).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { mysql: [], mssql: [] }, error: null });
  });

  it('rejects restore traversal filename', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'manager-'));
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/restores/mysql',
      payload: { filename: '../bad.sql.gz' }
    });

    expect(response.statusCode).toBe(400);
  });
});
