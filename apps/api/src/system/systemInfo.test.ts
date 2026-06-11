import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSystemInfo,
  getServerIpChoices,
  normalizeGameNetworkConfig,
  validateGameNetworkPayload
} from './systemInfo.js';

let root: string;
let envPath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'system-info-'));
  envPath = path.join(root, '.env');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('systemInfo domain', () => {
  it('builds IPv4 choices from server network interfaces plus loopback', () => {
    const choices = getServerIpChoices({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as any],
      eth0: [{ address: '192.168.1.20', family: 'IPv4', internal: false } as any],
      docker0: [{ address: '172.18.0.1', family: 'IPv4', internal: false } as any]
    });

    expect(choices).toEqual(['127.0.0.1', '172.18.0.1', '192.168.1.20']);
  });

  it('replaces missing and legacy auto env values with 127.0.0.1 for the form', () => {
    expect(
      normalizeGameNetworkConfig({ JX_IP: 'auto', JX_MYSQL_IP: '', JX_PAYSYS_IP: '192.168.1.20' }, [
        '127.0.0.1',
        '192.168.1.20'
      ])
    ).toEqual({
      jxIp: '127.0.0.1',
      mysqlIp: '127.0.0.1',
      paysysIp: '192.168.1.20',
      mssqlIp: '127.0.0.1'
    });
  });

  it('rejects auto and IPs outside the detected choices', () => {
    expect(() =>
      validateGameNetworkPayload(
        { jxIp: 'auto', mysqlIp: '127.0.0.1', paysysIp: '127.0.0.1', mssqlIp: '127.0.0.1' },
        ['127.0.0.1']
      )
    ).toThrow('IP không hợp lệ');

    expect(() =>
      validateGameNetworkPayload(
        { jxIp: '10.0.0.8', mysqlIp: '127.0.0.1', paysysIp: '127.0.0.1', mssqlIp: '127.0.0.1' },
        ['127.0.0.1']
      )
    ).toThrow('IP không hợp lệ');
  });

  it('builds header display data from env and running services', () => {
    writeFileSync(
      envPath,
      'JX_IP=192.168.1.20\nJX_MYSQL_IP=127.0.0.1\nJX_PAYSYS_IP=127.0.0.1\nJX_MSSQL_IP=192.168.1.20\n',
      'utf8'
    );

    const info = buildSystemInfo({
      envFilePath: envPath,
      ipChoices: ['127.0.0.1', '192.168.1.20'],
      coreServices: [
        { name: 'jxserver', state: 'running' },
        { name: 'goddess', state: 'exited' }
      ],
      now: new Date('2026-06-11T08:00:00.000Z'),
      timezone: 'Asia/Ho_Chi_Minh'
    });

    expect(info).toMatchObject({
      timezone: 'Asia/Ho_Chi_Minh',
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      coreServicesRunning: true,
      runningCoreServices: ['jxserver']
    });
  });
});
