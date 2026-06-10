import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('service routes', () => {
  it('returns normalized service list', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
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
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/api/services/not-real/start' });

    expect(response.statusCode).toBe(400);
  });

  it('runs start through docker compose up with an allowlisted service', async () => {
    const calls: string[][] = [];
    const app = await buildApp({
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
