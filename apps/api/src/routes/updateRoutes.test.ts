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

const run = {
  runId: 'run-1',
  status: 'running',
  stage: 'building',
  currentVersion: 'v1.0.0',
  targetTag: 'v1.1.0',
  releaseUrl: 'url',
  releaseNotesSnapshot: 'Notes',
  startedAt: '2026-06-24T10:00:00.000Z',
  updatedAt: '2026-06-24T10:00:00.000Z',
  finishedAt: null,
  failedStep: null,
  failedCommand: null,
  error: null,
  logs: []
};

function makeService(overrides: Record<string, unknown> = {}) {
  return {
    getStatus: vi.fn().mockResolvedValue(status),
    checkForUpdates: vi.fn().mockResolvedValue(status),
    runUpdate: vi.fn(),
    startUpdateRun: vi.fn().mockResolvedValue(run),
    getLatestRun: vi.fn().mockReturnValue(run),
    getRun: vi.fn().mockReturnValue(run),
    ...overrides
  } as any;
}

describe('update routes', () => {
  it('returns update status', async () => {
    const app = Fastify();
    await registerUpdateRoutes(app, makeService());

    const response = await app.inject({ method: 'GET', url: '/api/update/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(status);
  });

  it('forces release check', async () => {
    const app = Fastify();
    const checkForUpdates = vi.fn().mockResolvedValue(status);
    await registerUpdateRoutes(app, makeService({ checkForUpdates }));

    const response = await app.inject({ method: 'POST', url: '/api/update/check' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.latestTag).toBe('v1.1.0');
    expect(checkForUpdates).toHaveBeenCalledOnce();
  });

  it('starts an update run', async () => {
    const app = Fastify();
    const startUpdateRun = vi.fn().mockResolvedValue(run);
    await registerUpdateRoutes(app, makeService({ startUpdateRun }));

    const response = await app.inject({ method: 'POST', url: '/api/update/run' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.runId).toBe('run-1');
    expect(startUpdateRun).toHaveBeenCalledOnce();
  });

  it('returns latest update run', async () => {
    const app = Fastify();
    const getLatestRun = vi.fn().mockReturnValue(run);
    await registerUpdateRoutes(app, makeService({ getLatestRun }));

    const response = await app.inject({ method: 'GET', url: '/api/update/runs/latest' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.runId).toBe('run-1');
    expect(getLatestRun).toHaveBeenCalledOnce();
  });

  it('returns an update run by id', async () => {
    const app = Fastify();
    const getRun = vi.fn().mockReturnValue(run);
    await registerUpdateRoutes(app, makeService({ getRun }));

    const response = await app.inject({ method: 'GET', url: '/api/update/runs/run-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.runId).toBe('run-1');
    expect(getRun).toHaveBeenCalledWith('run-1');
  });

  it('returns 404 when update run is missing', async () => {
    const app = Fastify();
    await registerUpdateRoutes(app, makeService({ getRun: vi.fn().mockReturnValue(null) }));

    const response = await app.inject({ method: 'GET', url: '/api/update/runs/missing' });

    expect(response.statusCode).toBe(404);
  });
});
