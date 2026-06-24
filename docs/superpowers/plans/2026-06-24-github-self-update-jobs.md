# GitHub Self-Update Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent, resumable GitHub self-update jobs with durable logs, clear stages, single-active-run protection, and UI resume after API/UI restart.

**Architecture:** Add a small JSON-backed update-run repository in the API, then refactor `UpdateService` so update execution writes stages/logs into durable run state. Routes split job creation, job read, latest-run read, and run-specific SSE stream. UI starts/resumes runs by `runId`, treats SSE as optional realtime transport, and uses polling as source of truth.

**Tech Stack:** Node.js/Fastify API, TypeScript, filesystem JSON persistence, Docker Compose CLI, React, TanStack Query, Mantine, Vitest.

---

## File Structure

- Create: `apps/api/src/services/updateRunTypes.ts` — shared API-side update-run types and active-status helpers.
- Create: `apps/api/src/services/updateRunRepository.ts` — JSON read/write/prune helpers for `apps/jx-services/mount/update/update-runs.json`.
- Test: `apps/api/src/services/updateRunRepository.test.ts` — durable state, active run, prune, append log tests.
- Modify: `apps/api/src/services/updateService.ts` — add job-based `startUpdateRun`, `getRun`, `getLatestRun`, `streamRun`; keep `checkForUpdates`.
- Modify: `apps/api/src/services/updateService.test.ts` — update tests from direct stream flow to job flow.
- Modify: `apps/api/src/routes/updateRoutes.ts` — add job routes, keep old status route.
- Modify: `apps/api/src/routes/updateRoutes.test.ts` — route contract tests for start/latest/get/stream.
- Modify: `apps/ui/src/services/types.ts` — add `UpdateRun`, `UpdateRunStatus`, `UpdateRunStage`, `UpdateRunLog`.
- Modify: `apps/ui/src/services/updateService.ts` — add run APIs and run stream API.
- Modify: `apps/ui/src/hooks/useUpdateStatus.ts` — expose run mutations/queries and polling helpers.
- Modify: `apps/ui/src/views/settings/components/SelfUpdatePanel.tsx` — replace local-only log handling with durable job UI.
- Modify: `apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx` — update tests for run start, resume, failure, success.

---

### Task 1: Add Update Run Types

**Files:**
- Create: `apps/api/src/services/updateRunTypes.ts`
- Test: covered in Task 2 repository tests

- [ ] **Step 1: Create type file**

Create `apps/api/src/services/updateRunTypes.ts`:

```ts
export type UpdateRunStatus = 'queued' | 'running' | 'restarting' | 'verifying' | 'succeeded' | 'failed';

export type UpdateRunStage =
  | 'checking'
  | 'preparing'
  | 'fetching'
  | 'checkout'
  | 'building'
  | 'restarting'
  | 'verifying'
  | 'succeeded'
  | 'failed';

export type UpdateRunLogLevel = 'status' | 'log' | 'error';

export type UpdateRunLog = {
  at: string;
  level: UpdateRunLogLevel;
  message: string;
};

export type UpdateRun = {
  runId: string;
  status: UpdateRunStatus;
  stage: UpdateRunStage;
  currentVersion: string;
  targetTag: string;
  releaseUrl: string | null;
  releaseNotesSnapshot: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  failedStep: UpdateRunStage | null;
  failedCommand: string | null;
  error: string | null;
  logs: UpdateRunLog[];
};

export type UpdateRunsFile = {
  version: 1;
  runs: UpdateRun[];
};

export const activeUpdateRunStatuses: UpdateRunStatus[] = ['running', 'restarting', 'verifying'];

export function isActiveUpdateRun(run: UpdateRun): boolean {
  return activeUpdateRunStatuses.includes(run.status);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm --workspace apps/api run build`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/updateRunTypes.ts
git commit -m "feat: add update run types"
```

---

### Task 2: Add JSON Update Run Repository

**Files:**
- Create: `apps/api/src/services/updateRunRepository.ts`
- Test: `apps/api/src/services/updateRunRepository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `apps/api/src/services/updateRunRepository.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --workspace apps/api test -- updateRunRepository.test.ts`

Expected: FAIL with module not found for `updateRunRepository.js`.

- [ ] **Step 3: Implement repository**

Create `apps/api/src/services/updateRunRepository.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { UpdateRun, UpdateRunLog, UpdateRunsFile } from './updateRunTypes.js';
import { isActiveUpdateRun } from './updateRunTypes.js';

const maxStoredRuns = 20;

export class UpdateRunRepository {
  constructor(private readonly filePath: string) {}

  read(): UpdateRunsFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, runs: [] };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as UpdateRunsFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.runs)) {
        return { version: 1, runs: [] };
      }
      return parsed;
    } catch {
      return { version: 1, runs: [] };
    }
  }

  write(data: UpdateRunsFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const pruned = this.prune(data.runs);
    fs.writeFileSync(this.filePath, JSON.stringify({ version: 1, runs: pruned }, null, 2) + '\n', 'utf8');
  }

  list(): UpdateRun[] {
    return this.read().runs;
  }

  get(runId: string): UpdateRun | null {
    return this.read().runs.find((run) => run.runId === runId) ?? null;
  }

  getLatest(): UpdateRun | null {
    return [...this.read().runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }

  getActive(): UpdateRun | null {
    return this.read().runs.find(isActiveUpdateRun) ?? null;
  }

  upsert(run: UpdateRun): UpdateRun {
    const data = this.read();
    const index = data.runs.findIndex((item) => item.runId === run.runId);
    if (index >= 0) {
      data.runs[index] = run;
    } else {
      data.runs.push(run);
    }
    this.write(data);
    return run;
  }

  patch(runId: string, patcher: (run: UpdateRun) => UpdateRun): UpdateRun | null {
    const run = this.get(runId);
    if (!run) {
      return null;
    }
    return this.upsert(patcher(run));
  }

  appendLog(runId: string, log: UpdateRunLog): UpdateRun | null {
    return this.patch(runId, (run) => ({
      ...run,
      updatedAt: log.at,
      logs: [...run.logs, log],
    }));
  }

  private prune(runs: UpdateRun[]): UpdateRun[] {
    return [...runs]
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
      .slice(Math.max(0, runs.length - maxStoredRuns));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --workspace apps/api test -- updateRunRepository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/updateRunRepository.ts apps/api/src/services/updateRunRepository.test.ts
git commit -m "feat: persist self-update runs"
```

---

### Task 3: Refactor UpdateService Into Job Runner

**Files:**
- Modify: `apps/api/src/services/updateService.ts`
- Modify: `apps/api/src/services/updateService.test.ts`

- [ ] **Step 1: Add failing job tests**

Append these tests to `apps/api/src/services/updateService.test.ts` inside `describe('UpdateService', ...)`:

```ts
it('starts a durable update run and records release snapshot', async () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  const repository = {
    getActive: vi.fn().mockReturnValue(null),
    upsert: vi.fn((run) => run),
    patch: vi.fn((_runId, patcher) => patcher(repository.upsert.mock.calls.at(-1)?.[0])),
    appendLog: vi.fn(),
    get: vi.fn(),
    getLatest: vi.fn(),
  };
  const service = new UpdateService({
    projectRoot: '/host/quanlysvJX',
    currentVersion: 'v1.1.0',
    currentCommit: 'abc1234',
    releaseClient: {
      getLatestRelease: vi.fn().mockResolvedValue({ tagName: 'v1.1.1', htmlUrl: 'url', body: 'notes' }),
    },
    commandRunner: {
      run: vi.fn().mockResolvedValue({ code: 0, stdout: 'updater-id\n', stderr: '' }),
      stream: vi.fn().mockResolvedValue(0),
    },
    now: () => new Date('2026-06-24T10:00:00.000Z'),
    runRepository: repository as any,
  });

  const run = await service.startUpdateRun();

  expect(run.runId).toContain('update-');
  expect(run.status).toBe('running');
  expect(run.stage).toBe('checking');
  expect(run.targetTag).toBe('v1.1.1');
  expect(run.releaseNotesSnapshot).toBe('notes');
  expect(repository.upsert).toHaveBeenCalled();

  vi.restoreAllMocks();
});

it('returns active update run instead of creating another one', async () => {
  const activeRun = {
    runId: 'run-active',
    status: 'running',
    stage: 'building',
    currentVersion: 'v1.1.0',
    targetTag: 'v1.1.1',
    releaseUrl: 'url',
    releaseNotesSnapshot: 'notes',
    startedAt: '2026-06-24T10:00:00.000Z',
    updatedAt: '2026-06-24T10:00:00.000Z',
    finishedAt: null,
    failedStep: null,
    failedCommand: null,
    error: null,
    logs: [],
  };
  const releaseClient = { getLatestRelease: vi.fn() };
  const service = new UpdateService({
    projectRoot: '/host/quanlysvJX',
    releaseClient,
    commandRunner: { run: vi.fn(), stream: vi.fn() },
    now: () => new Date('2026-06-24T10:00:00.000Z'),
    runRepository: { getActive: vi.fn().mockReturnValue(activeRun) } as any,
  });

  await expect(service.startUpdateRun()).resolves.toBe(activeRun);
  expect(releaseClient.getLatestRelease).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm --workspace apps/api test -- updateService.test.ts`

Expected: FAIL because `startUpdateRun` and `runRepository` dependency do not exist.

- [ ] **Step 3: Extend dependencies and add repository default**

In `apps/api/src/services/updateService.ts`, import repository/types and extend deps:

```ts
import { UpdateRunRepository } from './updateRunRepository.js';
import type { UpdateRun, UpdateRunLogLevel, UpdateRunStage, UpdateRunStatus } from './updateRunTypes.js';
```

Update `UpdateServiceDeps`:

```ts
type UpdateServiceDeps = {
  projectRoot: string;
  currentVersion?: string;
  currentCommit?: string;
  updaterImage?: string;
  releaseClient: ReleaseClient;
  commandRunner: CommandRunner;
  runRepository?: UpdateRunRepository;
  now: () => Date;
};
```

Inside `UpdateService` add:

```ts
private readonly runRepository: UpdateRunRepository;

constructor(private readonly deps: UpdateServiceDeps) {
  this.runRepository =
    deps.runRepository ??
    new UpdateRunRepository(path.join(deps.projectRoot, 'apps/jx-services/mount/update/update-runs.json'));
}
```

- [ ] **Step 4: Add job read methods**

Add to `UpdateService`:

```ts
getRun(runId: string): UpdateRun | null {
  return this.runRepository.get(runId);
}

getLatestRun(): UpdateRun | null {
  return this.runRepository.getLatest();
}
```

- [ ] **Step 5: Add startUpdateRun skeleton**

Add to `UpdateService`:

```ts
async startUpdateRun(): Promise<UpdateRun> {
  const activeRun = this.runRepository.getActive();
  if (activeRun) {
    return activeRun;
  }

  const status = await this.checkForUpdates();
  if (!status.latestTag) {
    throw new Error('No GitHub release found');
  }
  this.assertSafeTag(status.latestTag);

  const now = this.deps.now().toISOString();
  const run: UpdateRun = {
    runId: `update-${Date.now()}`,
    status: 'running',
    stage: 'checking',
    currentVersion: status.currentVersion,
    targetTag: status.latestTag,
    releaseUrl: status.releaseUrl,
    releaseNotesSnapshot: status.releaseNotes,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    failedStep: null,
    failedCommand: null,
    error: null,
    logs: [{ at: now, level: 'status', message: `Bắt đầu cập nhật lên ${status.latestTag}` }],
  };

  this.runRepository.upsert(run);
  void this.executeRun(run.runId);
  return run;
}
```

- [ ] **Step 6: Add run execution helpers**

Add helpers to `UpdateService`:

```ts
private appendRunLog(runId: string, level: UpdateRunLogLevel, message: string): void {
  this.runRepository.appendLog(runId, { at: this.deps.now().toISOString(), level, message });
}

private setRunStage(runId: string, stage: UpdateRunStage, status: UpdateRunStatus = 'running'): void {
  const now = this.deps.now().toISOString();
  this.runRepository.patch(runId, (run) => ({ ...run, stage, status, updatedAt: now }));
  this.appendRunLog(runId, 'status', stage);
}

private failRun(runId: string, stage: UpdateRunStage, command: string | null, error: unknown): void {
  const now = this.deps.now().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  this.runRepository.patch(runId, (run) => ({
    ...run,
    status: 'failed',
    stage: 'failed',
    updatedAt: now,
    finishedAt: now,
    failedStep: stage,
    failedCommand: command,
    error: message,
    logs: [...run.logs, { at: now, level: 'error', message }],
  }));
}

private succeedRun(runId: string): void {
  const now = this.deps.now().toISOString();
  this.runRepository.patch(runId, (run) => ({
    ...run,
    status: 'succeeded',
    stage: 'succeeded',
    updatedAt: now,
    finishedAt: now,
    logs: [...run.logs, { at: now, level: 'status', message: `Đã cập nhật thành công ${run.targetTag}` }],
  }));
}
```

- [ ] **Step 7: Move current update flow into executeRun**

Add:

```ts
private async executeRun(runId: string): Promise<void> {
  const run = this.runRepository.get(runId);
  if (!run) {
    return;
  }

  try {
    this.setRunStage(runId, 'preparing');
    this.ensureJxEnvFile((event) => this.appendRunLog(runId, event.type === 'error' ? 'error' : 'status', event.message));

    this.setRunStage(runId, 'fetching');
    await this.streamStep('git', ['fetch', '--tags', 'origin'], (event) => this.appendRunLog(runId, event.type === 'error' ? 'error' : 'log', event.message));

    this.setRunStage(runId, 'checkout');
    await this.streamStep('git', ['checkout', '-f', run.targetTag], (event) => this.appendRunLog(runId, event.type === 'error' ? 'error' : 'log', event.message));
    this.writeVersionFile(run.targetTag, (event) => this.appendRunLog(runId, 'status', event.message));

    this.setRunStage(runId, 'building');
    await this.startDetachedUpdater(run.targetTag, (event) => this.appendRunLog(runId, event.type === 'error' ? 'error' : 'status', event.message));

    this.setRunStage(runId, 'restarting', 'restarting');
    this.setRunStage(runId, 'verifying', 'verifying');
  } catch (error) {
    const failedRun = this.runRepository.get(runId);
    this.failRun(runId, failedRun?.stage ?? 'failed', null, error);
  }
}
```

Refactor current inline `version.json` write code into:

```ts
private writeVersionFile(tag: string, onEvent: (event: UpdateEvent) => void): void {
  try {
    const versionFilePath = path.join(this.deps.projectRoot, 'version.json');
    fs.writeFileSync(versionFilePath, JSON.stringify({ version: tag, commit: 'unknown' }, null, 2) + '\n', 'utf8');
    onEvent({ type: 'status', message: `Đã cập nhật file version.json thành ${tag}` });
  } catch (err) {
    onEvent({ type: 'status', message: `Cảnh báo: Không thể ghi file version.json: ${err instanceof Error ? err.message : String(err)}` });
  }
}
```

- [ ] **Step 8: Keep legacy runUpdate temporarily**

Replace `runUpdate` body with compatibility wrapper:

```ts
async runUpdate(onEvent: (event: UpdateEvent) => void = () => undefined): Promise<void> {
  const run = await this.startUpdateRun();
  for (const log of run.logs) {
    onEvent({ type: log.level === 'error' ? 'error' : 'status', message: log.message });
  }
}
```

- [ ] **Step 9: Run tests**

Run:

```bash
npm --workspace apps/api test -- updateService.test.ts updateRunRepository.test.ts
npm --workspace apps/api run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/services/updateService.ts apps/api/src/services/updateService.test.ts
git commit -m "feat: run self-updates as durable jobs"
```

---

### Task 4: Add Update Job Routes

**Files:**
- Modify: `apps/api/src/routes/updateRoutes.ts`
- Modify: `apps/api/src/routes/updateRoutes.test.ts`

- [ ] **Step 1: Add failing route tests**

Append to `apps/api/src/routes/updateRoutes.test.ts`:

```ts
it('starts an update run', async () => {
  const service = {
    getStatus: vi.fn(),
    checkForUpdates: vi.fn(),
    startUpdateRun: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'running', logs: [] }),
    getLatestRun: vi.fn(),
    getRun: vi.fn(),
    streamRun: vi.fn(),
  };
  const app = await buildTestApp(service as any);

  const response = await app.inject({ method: 'POST', url: '/api/update/run' });

  expect(response.statusCode).toBe(200);
  expect(response.json().data.runId).toBe('run-1');
});

it('returns latest update run', async () => {
  const service = {
    getStatus: vi.fn(),
    checkForUpdates: vi.fn(),
    startUpdateRun: vi.fn(),
    getLatestRun: vi.fn().mockReturnValue({ runId: 'run-latest', status: 'succeeded', logs: [] }),
    getRun: vi.fn(),
    streamRun: vi.fn(),
  };
  const app = await buildTestApp(service as any);

  const response = await app.inject({ method: 'GET', url: '/api/update/runs/latest' });

  expect(response.statusCode).toBe(200);
  expect(response.json().data.runId).toBe('run-latest');
});

it('returns 404 when update run is missing', async () => {
  const service = {
    getStatus: vi.fn(),
    checkForUpdates: vi.fn(),
    startUpdateRun: vi.fn(),
    getLatestRun: vi.fn(),
    getRun: vi.fn().mockReturnValue(null),
    streamRun: vi.fn(),
  };
  const app = await buildTestApp(service as any);

  const response = await app.inject({ method: 'GET', url: '/api/update/runs/missing' });

  expect(response.statusCode).toBe(404);
});
```

If `buildTestApp` helper does not exist, create it at top of the test file:

```ts
async function buildTestApp(service: any) {
  const app = Fastify();
  app.decorate('deps', { config: { projectRoot: '/workspace' } });
  await registerUpdateRoutes(app as any, service);
  return app;
}
```

- [ ] **Step 2: Run failing tests**

Run: `npm --workspace apps/api test -- updateRoutes.test.ts`

Expected: FAIL for missing routes.

- [ ] **Step 3: Add routes**

Modify `apps/api/src/routes/updateRoutes.ts` after check routes:

```ts
  app.post('/api/update/run', async (_request, reply) =>
    reply.send(success(await updateService.startUpdateRun())),
  );

  app.get('/api/update/runs/latest', async (_request, reply) =>
    reply.send(success(updateService.getLatestRun())),
  );

  app.get<{ Params: { runId: string } }>('/api/update/runs/:runId', async (request, reply) => {
    const run = updateService.getRun(request.params.runId);
    if (!run) {
      return reply.status(404).send({ status: 'error', message: 'Update run not found' });
    }
    return reply.send(success(run));
  });
```

- [ ] **Step 4: Add route-level stream wrapper**

Add `streamRun` route using polling loop if service stream emitter is not implemented yet:

```ts
  app.get<{ Params: { runId: string } }>('/api/update/runs/:runId/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    let sent = 0;
    const interval = setInterval(() => {
      const run = updateService.getRun(request.params.runId);
      if (!run) {
        writeSse(reply, { type: 'error', message: 'Update run not found' });
        clearInterval(interval);
        reply.raw.end();
        return;
      }

      for (const log of run.logs.slice(sent)) {
        writeSse(reply, { type: log.level === 'error' ? 'error' : 'log', message: log.message });
      }
      sent = run.logs.length;

      if (run.status === 'succeeded' || run.status === 'failed') {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1000);

    reply.raw.on('close', () => clearInterval(interval));
  });
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm --workspace apps/api test -- updateRoutes.test.ts updateService.test.ts updateRunRepository.test.ts
npm --workspace apps/api run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/updateRoutes.ts apps/api/src/routes/updateRoutes.test.ts
git commit -m "feat: expose self-update job routes"
```

---

### Task 5: Add UI Update Run API Client

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Modify: `apps/ui/src/services/updateService.ts`
- Modify: `apps/ui/src/hooks/useUpdateStatus.ts`

- [ ] **Step 1: Add UI types**

Add to `apps/ui/src/services/types.ts` near existing update types:

```ts
export type UpdateRunStatus = 'queued' | 'running' | 'restarting' | 'verifying' | 'succeeded' | 'failed';

export type UpdateRunStage =
  | 'checking'
  | 'preparing'
  | 'fetching'
  | 'checkout'
  | 'building'
  | 'restarting'
  | 'verifying'
  | 'succeeded'
  | 'failed';

export type UpdateRunLog = {
  at: string;
  level: 'status' | 'log' | 'error';
  message: string;
};

export type UpdateRun = {
  runId: string;
  status: UpdateRunStatus;
  stage: UpdateRunStage;
  currentVersion: string;
  targetTag: string;
  releaseUrl: string | null;
  releaseNotesSnapshot: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  failedStep: UpdateRunStage | null;
  failedCommand: string | null;
  error: string | null;
  logs: UpdateRunLog[];
};
```

- [ ] **Step 2: Add service methods**

Modify imports in `apps/ui/src/services/updateService.ts`:

```ts
import type { UpdateEvent, UpdateRun, UpdateStatus } from './types';
```

Add methods inside `updateService`:

```ts
  startRun: async () => {
    const res = await ApiService.fetchData<any, UpdateRun>({
      url: '/api/update/run',
      method: 'POST',
    });
    return res.data;
  },
  getLatestRun: async () => {
    const res = await ApiService.fetchData<any, UpdateRun | null>({
      url: '/api/update/runs/latest',
      method: 'GET',
    });
    return res.data;
  },
  getRun: async (runId: string) => {
    const res = await ApiService.fetchData<any, UpdateRun>({
      url: `/api/update/runs/${runId}`,
      method: 'GET',
    });
    return res.data;
  },
  streamRun: (
    runId: string,
    handlers: {
      onEvent: (event: UpdateEvent) => void;
      onDone: () => void;
      onError: (message: string) => void;
    }
  ) => {
    const source = new EventSource(`/api/update/runs/${runId}/stream`);
    source.onmessage = (message) => handlers.onEvent(JSON.parse(message.data) as UpdateEvent);
    source.onerror = () => {
      source.close();
      handlers.onError('Mất kết nối theo dõi cập nhật');
    };
    return () => source.close();
  },
```

- [ ] **Step 3: Update hook**

Modify `apps/ui/src/hooks/useUpdateStatus.ts`:

```ts
export const updateKeys = {
  all: ['update'] as const,
  status: () => [...updateKeys.all, 'status'] as const,
  latestRun: () => [...updateKeys.all, 'runs', 'latest'] as const,
  run: (runId: string) => [...updateKeys.all, 'runs', runId] as const,
};
```

Add queries/mutations in `useUpdateStatus`:

```ts
  const latestRunQuery = useQuery({
    queryKey: updateKeys.latestRun(),
    queryFn: updateService.getLatestRun,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'restarting' || status === 'verifying' ? 3000 : false;
    },
  });

  const startRunMutation = useMutation({
    mutationFn: updateService.startRun,
    onSuccess: (run) => {
      queryClient.setQueryData(updateKeys.run(run.runId), run);
      void queryClient.invalidateQueries({ queryKey: updateKeys.latestRun() });
    },
  });
```

Return:

```ts
    latestRun: latestRunQuery.data,
    isLoadingLatestRun: latestRunQuery.isLoading,
    startRun: startRunMutation.mutateAsync,
    isStartingRun: startRunMutation.isPending,
    getRun: updateService.getRun,
    streamRun: updateService.streamRun,
```

- [ ] **Step 4: Run typecheck**

Run: `npm --workspace apps/ui run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/services/types.ts apps/ui/src/services/updateService.ts apps/ui/src/hooks/useUpdateStatus.ts
git commit -m "feat: add self-update run client"
```

---

### Task 6: Refactor SelfUpdatePanel To Durable Runs

**Files:**
- Modify: `apps/ui/src/views/settings/components/SelfUpdatePanel.tsx`
- Modify: `apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx`

- [ ] **Step 1: Update failing tests**

Modify mock in `SelfUpdatePanel.test.tsx` to include run APIs:

```ts
const mocks = vi.hoisted(() => ({
  startRun: vi.fn(),
  streamRun: vi.fn(),
}));
```

Mock hook return:

```ts
    latestRun: null,
    isLoadingLatestRun: false,
    startRun: mocks.startRun,
    isStartingRun: false,
    streamRun: mocks.streamRun,
```

Replace old SSE-disconnect test with:

```ts
it('starts a durable update run and streams that run', async () => {
  mocks.startRun.mockResolvedValue({
    runId: 'run-1',
    status: 'running',
    stage: 'building',
    currentVersion: 'v1.1.0',
    targetTag: 'v1.1.1',
    releaseUrl: 'url',
    releaseNotesSnapshot: 'notes',
    startedAt: '2026-06-24T10:00:00.000Z',
    updatedAt: '2026-06-24T10:00:00.000Z',
    finishedAt: null,
    failedStep: null,
    failedCommand: null,
    error: null,
    logs: [],
  });

  renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, { route: '/settings' });
  fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

  await screen.findByText(/Đang cập nhật/);
  expect(mocks.startRun).toHaveBeenCalled();
  expect(mocks.streamRun).toHaveBeenCalledWith('run-1', expect.any(Object));
});
```

Add failed resume test:

```ts
it('shows failed latest run with retry option', () => {
  mockLatestRun = {
    runId: 'run-failed',
    status: 'failed',
    stage: 'failed',
    currentVersion: 'v1.1.0',
    targetTag: 'v1.1.1',
    releaseUrl: 'url',
    releaseNotesSnapshot: 'notes',
    startedAt: '2026-06-24T10:00:00.000Z',
    updatedAt: '2026-06-24T10:01:00.000Z',
    finishedAt: '2026-06-24T10:01:00.000Z',
    failedStep: 'building',
    failedCommand: 'docker compose build',
    error: 'build failed',
    logs: [{ at: '2026-06-24T10:01:00.000Z', level: 'error', message: 'build failed' }],
  };

  renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, { route: '/settings' });

  expect(screen.getByText(/Cập nhật thất bại/)).toBeTruthy();
  expect(screen.getByText(/build failed/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /thử lại/i })).toBeTruthy();
});
```

- [ ] **Step 2: Run failing tests**

Run: `npm --workspace apps/ui run vitest -- SelfUpdatePanel.test.tsx`

Expected: FAIL because UI still uses old `streamUpdate` flow.

- [ ] **Step 3: Refactor component state**

In `SelfUpdatePanel.tsx`, destructure new hook values:

```ts
const {
  status,
  isLoading,
  checkNow,
  isChecking,
  latestRun,
  startRun,
  isStartingRun,
  streamRun,
} = useUpdateStatus();
```

Replace `logs` source with derived run logs:

```ts
const activeRun = currentRun ?? latestRun ?? null;
const logs = activeRun?.logs.map((log) => `[${log.level}] ${log.message}`) ?? [];
const isRunActive = activeRun?.status === 'running' || activeRun?.status === 'restarting' || activeRun?.status === 'verifying';
```

- [ ] **Step 4: Replace handleUpdate**

Use run API:

```ts
const handleUpdate = async () => {
  try {
    const run = await startRun();
    setCurrentRun(run);
    const close = streamRun(run.runId, {
      onEvent: () => void refreshRun(run.runId),
      onDone: () => void refreshRun(run.runId),
      onError: () => void refreshRun(run.runId),
    });
    streamCloseRef.current = close;
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Không thể bắt đầu cập nhật');
  }
};
```

Add helper:

```ts
const refreshRun = async (runId: string) => {
  try {
    const run = await updateService.getRun(runId);
    setCurrentRun(run);
    if (run.status === 'succeeded') {
      onSuccess(`Đã cập nhật JX Manager lên ${run.targetTag}`);
      void checkNow();
    }
    if (run.status === 'failed') {
      onError(run.error ?? 'Cập nhật thất bại');
    }
  } catch {
    // API may be restarting; polling/latestRun query will recover.
  }
};
```

If direct service import is undesirable, expose `getRun` from hook and use that instead.

- [ ] **Step 5: Add latest-run resume effect**

```ts
useEffect(() => {
  if (!latestRun) {
    return;
  }
  setCurrentRun(latestRun);
  if (latestRun.status === 'succeeded') {
    onSuccess(`Đã cập nhật JX Manager lên ${latestRun.targetTag}`);
  }
  if (latestRun.status === 'failed') {
    onError(latestRun.error ?? 'Cập nhật thất bại');
  }
}, [latestRun, onSuccess, onError]);
```

Guard duplicate notifications with a `notifiedRunIdsRef` set:

```ts
const notifiedRunIdsRef = useRef(new Set<string>());
```

Only notify if not in set, then add.

- [ ] **Step 6: Render run summary**

Add after release notes card:

```tsx
{activeRun && (
  <Alert color={activeRun.status === 'failed' ? 'red' : activeRun.status === 'succeeded' ? 'green' : 'blue'} title={`Run ${activeRun.runId}`}>
    <Stack gap="xs">
      <Text size="sm">Trạng thái: {activeRun.status}</Text>
      <Text size="sm">Bước: {activeRun.stage}</Text>
      <Text size="sm">Mục tiêu: {activeRun.targetTag}</Text>
      {activeRun.error && <Text size="sm">Lỗi: {activeRun.error}</Text>}
    </Stack>
  </Alert>
)}
```

Change update button label:

```tsx
{activeRun?.status === 'failed' ? 'Thử lại' : isRunActive ? 'Đang cập nhật...' : 'Cập nhật'}
```

- [ ] **Step 7: Run UI checks**

Run:

```bash
npx oxfmt --write apps/ui/src/views/settings/components/SelfUpdatePanel.tsx apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx
npm --workspace apps/ui run vitest -- SelfUpdatePanel.test.tsx
npm --workspace apps/ui run typecheck
npm --workspace apps/ui run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/views/settings/components/SelfUpdatePanel.tsx apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx
git commit -m "feat: resume self-update jobs in ui"
```

---

### Task 7: Integration Verification

**Files:**
- Modify if needed: `apps/api/src/routes/updateRoutes.ts`, `apps/api/src/services/updateService.ts`, `apps/ui/src/views/settings/components/SelfUpdatePanel.tsx`

- [ ] **Step 1: Run API targeted tests**

```bash
npm --workspace apps/api test -- updateRunRepository.test.ts updateService.test.ts updateRoutes.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run UI targeted tests**

```bash
npm --workspace apps/ui run vitest -- SelfUpdatePanel.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run builds**

```bash
npm --workspace apps/api run build
npm --workspace apps/ui run build
```

Expected: both PASS.

- [ ] **Step 4: Manual docker smoke test on clone machine**

Run on clone host:

```bash
docker compose up -d --build
curl -f http://127.0.0.1:3001/api/health
curl -f http://127.0.0.1:3001/api/update/status
```

Expected:
- API health returns success.
- Update status returns `status: success`.
- UI loads.

- [ ] **Step 5: Manual update smoke test**

On clone host/UI:

1. Open `/settings/system`.
2. Click `Cập nhật`.
3. Confirm UI shows run id/status/stage/log.
4. Refresh browser while update is running.
5. Confirm UI resumes latest run.
6. Wait for restart.
7. Confirm UI shows success and current version equals target tag.

Expected: no false “kết nối thất bại”; logs persist in `apps/jx-services/mount/update/update-runs.json`.

- [ ] **Step 6: Commit any final fixes**

```bash
git status --short
git add <changed-files>
git commit -m "fix: stabilize self-update job flow"
```

Only run commit if Step 4/5 found fixes.

---

## Self-Review

- Spec coverage: persistent JSON state covered by Tasks 1-2; job API by Task 4; concurrency by Task 3; failure logging by Task 3; UI resume by Tasks 5-6; testing/manual verification by Task 7.
- Placeholder scan: no TBD/TODO placeholders; each task names files, commands, and expected results.
- Type consistency: API and UI both use `UpdateRun`, `UpdateRunStatus`, `UpdateRunStage`, `UpdateRunLog`; route names match spec.
