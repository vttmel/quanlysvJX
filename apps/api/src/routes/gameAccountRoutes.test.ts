import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';
import type { GameAccountService } from '../gameAccounts/gameAccountService.js';

function testConfig(root: string): ManagerConfig {
  return {
    projectRoot: root,
    mysqlBackupDir: path.join(root, 'mysql'),
    mssqlBackupDir: path.join(root, 'mssql'),
    backupSchedule: '0 3 * * *',
    backupRetentionDays: 14,
    backupMetadataFile: path.join(root, 'backup-metadata.json'),
    backupScheduleFile: path.join(root, 'backup-schedules.json'),
    schedulerEnabled: false,
    mssql: { host: 'localhost', port: 1433, database: 'account_tong', user: null, password: null, encrypt: false, trustServerCertificate: true }
  };
}

function fakeService(): GameAccountService {
  return {
    list: vi.fn().mockResolvedValue({ items: [{ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }),
    create: vi.fn().mockResolvedValue({ accountName: 'newuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }),
    update: vi.fn().mockResolvedValue({ accountName: 'jxuser', expiresAt: '2028-01-01', leftSeconds: 5, usedSeconds: 0, status: 'active' }),
    softDelete: vi.fn().mockResolvedValue({ accountName: 'jxuser', expiresAt: '2028-01-01', leftSeconds: 5, usedSeconds: 0, status: 'banned' })
  };
}

describe('game account routes', () => {
  it('lists accounts with search and pagination', async () => {
    const service = fakeService();
    const app = await buildApp({ config: testConfig(mkdtempSync(path.join(tmpdir(), 'manager-'))), gameAccounts: service });

    const response = await app.inject({ method: 'GET', url: '/api/game-accounts?search=jx&page=1&pageSize=10' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0].accountName).toBe('jxuser');
    expect(service.list).toHaveBeenCalledWith({ search: 'jx', page: 1, pageSize: 10 });
  });

  it('creates accounts', async () => {
    const app = await buildApp({ config: testConfig(mkdtempSync(path.join(tmpdir(), 'manager-'))), gameAccounts: fakeService() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/game-accounts',
      payload: { accountName: 'newuser', password: 'a', secondaryPassword: 'b', expiresAt: '2027-06-10', leftSeconds: 0 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.accountName).toBe('newuser');
  });

  it('soft deletes accounts', async () => {
    const app = await buildApp({ config: testConfig(mkdtempSync(path.join(tmpdir(), 'manager-'))), gameAccounts: fakeService() });

    const response = await app.inject({ method: 'DELETE', url: '/api/game-accounts/jxuser' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('banned');
  });
});
