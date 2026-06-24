import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerUpdateRoutes } from './updateRoutes.js';

const status = {
  currentVersion: 'v1.0.0',
  currentCommit: 'abc1234',
  latestVersion: 'v1.1.0',
  latestTag: 'v1.1.0',
  releaseUrl: 'https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0',
  releaseNotes: 'Notes',
  hasUpdate: true,
  repoDirty: false,
  checkedAt: '2026-06-24T10:00:00.000Z'
};

describe('update routes', () => {
  it('returns update status', async () => {
    const app = Fastify();
    await registerUpdateRoutes(app, { getStatus: vi.fn().mockResolvedValue(status), checkForUpdates: vi.fn(), runUpdate: vi.fn() } as any);

    const response = await app.inject({ method: 'GET', url: '/api/update/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(status);
  });

  it('forces release check', async () => {
    const app = Fastify();
    const checkForUpdates = vi.fn().mockResolvedValue(status);
    await registerUpdateRoutes(app, { getStatus: vi.fn(), checkForUpdates, runUpdate: vi.fn() } as any);

    const response = await app.inject({ method: 'POST', url: '/api/update/check' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.latestTag).toBe('v1.1.0');
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });
});
