import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpdateRunRepository } from './updateRunRepository.js';
import type { UpdateRun } from './updateRunTypes.js';

function makeRun(id: string, status: UpdateRun['status'] = 'running'): UpdateRun {
  return {
    runId: id,
    status,
    stage: status === 'failed' ? 'failed' : status === 'succeeded' ? 'succeeded' : 'checking',
    currentVersion: 'v1.1.0',
    targetTag: 'v1.1.1',
    releaseUrl: 'https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.1',
    releaseNotesSnapshot: 'notes',
    startedAt: '2026-06-24T10:00:00.000Z',
    updatedAt: '2026-06-24T10:00:00.000Z',
    finishedAt: status === 'running' ? null : '2026-06-24T10:01:00.000Z',
    failedStep: status === 'failed' ? 'building' : null,
    failedCommand: status === 'failed' ? 'docker compose build' : null,
    error: status === 'failed' ? 'build failed' : null,
    logs: [],
  };
}

describe('UpdateRunRepository', () => {
  let tempDir: string;
  let repository: UpdateRunRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-runs-'));
    repository = new UpdateRunRepository(path.join(tempDir, 'apps/jx-services/mount/update/update-runs.json'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns an empty runs file when missing', () => {
    expect(repository.read()).toEqual({ version: 1, runs: [] });
  });

  it('creates parent directories and persists a run', () => {
    repository.upsert(makeRun('run-1'));

    expect(repository.get('run-1')?.targetTag).toBe('v1.1.1');
    expect(fs.existsSync(path.join(tempDir, 'apps/jx-services/mount/update/update-runs.json'))).toBe(true);
  });

  it('finds the active run', () => {
    repository.upsert(makeRun('old', 'failed'));
    repository.upsert(makeRun('active', 'restarting'));

    expect(repository.getActive()?.runId).toBe('active');
  });

  it('returns the latest run by startedAt', () => {
    repository.upsert({ ...makeRun('old', 'succeeded'), startedAt: '2026-06-24T09:00:00.000Z' });
    repository.upsert({ ...makeRun('new', 'failed'), startedAt: '2026-06-24T11:00:00.000Z' });

    expect(repository.getLatest()?.runId).toBe('new');
  });

  it('appends logs and updates timestamp', () => {
    repository.upsert(makeRun('run-1'));
    repository.appendLog('run-1', {
      at: '2026-06-24T10:00:10.000Z',
      level: 'status',
      message: 'fetching',
    });

    const run = repository.get('run-1');
    expect(run?.logs).toEqual([
      { at: '2026-06-24T10:00:10.000Z', level: 'status', message: 'fetching' },
    ]);
    expect(run?.updatedAt).toBe('2026-06-24T10:00:10.000Z');
  });

  it('keeps only the newest 20 runs', () => {
    for (let index = 0; index < 25; index += 1) {
      repository.upsert({
        ...makeRun(`run-${index}`, 'succeeded'),
        startedAt: `2026-06-24T10:${String(index).padStart(2, '0')}:00.000Z`,
      });
    }

    const runs = repository.read().runs;
    expect(runs).toHaveLength(20);
    expect(runs[0]?.runId).toBe('run-5');
    expect(runs[19]?.runId).toBe('run-24');
  });
});
