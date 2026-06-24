# JX Manager Self-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a UI-driven self-update flow that detects new GitHub Releases, checks out the latest release tag, rebuilds `api` and `ui`, and waits for the manager to come back online.

**Architecture:** Add an `update` API domain with a GitHub release client, git/compose command runner, Fastify routes, and SSE streaming. Add UI service/hook/components for dashboard notification, Settings update control, streamed logs, and health polling. Mount the full repo into the API container so it can run git and compose from `/workspace`.

**Tech Stack:** Fastify, TypeScript, React, Mantine, TanStack Query, Vitest, Docker Compose, GitHub Releases API, Server-Sent Events.

---

## File Structure

- Create `apps/api/src/services/updateService.ts`: release status, dirty gate, update orchestration.
- Create `apps/api/src/routes/updateRoutes.ts`: `/api/update/status`, `/api/update/check`, `/api/update/run/stream`.
- Create `apps/api/src/services/updateService.test.ts`: unit tests for version status and dirty blocking.
- Create `apps/api/src/routes/updateRoutes.test.ts`: Fastify route/SSE tests with injected service.
- Modify `apps/api/src/app.ts`: register update routes.
- Modify `docker-compose.yaml`: mount full repo to `/workspace`; keep Docker socket.
- Modify `apps/api/Dockerfile`: inject build metadata env defaults.
- Modify `apps/ui/src/services/types.ts`: add update types.
- Create `apps/ui/src/services/updateService.ts`: API client + SSE helper.
- Create `apps/ui/src/hooks/useUpdateStatus.ts`: query/mutation/stream helpers.
- Create `apps/ui/src/views/settings/components/SelfUpdatePanel.tsx`: Settings update UI.
- Create `apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx`: panel states.
- Modify `apps/ui/src/views/settings/index.tsx`: add update route/tab/card.
- Create `apps/ui/src/views/dashboard/components/UpdateBanner.tsx`: dashboard banner.
- Create `apps/ui/src/views/dashboard/components/UpdateBanner.test.tsx`: banner states.
- Modify `apps/ui/src/views/dashboard/index.tsx`: render banner.

---

### Task 1: API Update Service Tests

**Files:**
- Create: `apps/api/src/services/updateService.test.ts`
- Create in Task 2: `apps/api/src/services/updateService.ts`

- [ ] **Step 1: Write failing unit tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { UpdateService } from './updateService.js';

describe('UpdateService', () => {
  it('reports update available when latest release tag differs from current version', async () => {
    const service = new UpdateService({
      projectRoot: '/workspace',
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: 'v1.1.0',
          htmlUrl: 'https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0',
          body: 'Release notes'
        })
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        stream: vi.fn()
      },
      now: () => new Date('2026-06-24T10:00:00.000Z')
    });

    const status = await service.checkForUpdates();

    expect(status).toMatchObject({
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      latestVersion: 'v1.1.0',
      latestTag: 'v1.1.0',
      releaseUrl: 'https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0',
      releaseNotes: 'Release notes',
      hasUpdate: true,
      repoDirty: false,
      checkedAt: '2026-06-24T10:00:00.000Z'
    });
  });

  it('blocks update when repository has uncommitted changes', async () => {
    const commandRunner = {
      run: vi.fn().mockResolvedValue({ code: 0, stdout: ' M apps/api/src/app.ts\n', stderr: '' }),
      stream: vi.fn()
    };
    const service = new UpdateService({
      projectRoot: '/workspace',
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({ tagName: 'v1.1.0', htmlUrl: 'url', body: '' })
      },
      commandRunner,
      now: () => new Date('2026-06-24T10:00:00.000Z')
    });

    await expect(service.runUpdate()).rejects.toThrow('Repository has uncommitted changes');
    expect(commandRunner.stream).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/api test -- updateService.test.ts`

Expected: FAIL with module not found for `./updateService.js`.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/api/src/services/updateService.test.ts
git commit -m "test: define self-update service behavior"
```

---

### Task 2: API Update Service Implementation

**Files:**
- Create: `apps/api/src/services/updateService.ts`
- Modify: `apps/api/src/services/updateService.test.ts`

- [ ] **Step 1: Add service implementation**

```ts
import { spawn } from 'node:child_process';

export type UpdateStatus = {
  currentVersion: string;
  currentCommit: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  hasUpdate: boolean;
  repoDirty: boolean;
  checkedAt: string | null;
};

export type LatestRelease = {
  tagName: string;
  htmlUrl: string;
  body: string | null;
};

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = {
  run(command: string, args: string[], cwd: string): Promise<CommandResult>;
  stream(command: string, args: string[], cwd: string, onData: (line: string) => void): Promise<number>;
};

export type ReleaseClient = {
  getLatestRelease(): Promise<LatestRelease | null>;
};

export type UpdateEvent =
  | { type: 'status'; message: string }
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'restarting'; message: string };

type UpdateServiceDeps = {
  projectRoot: string;
  currentVersion: string;
  currentCommit: string;
  releaseClient: ReleaseClient;
  commandRunner: CommandRunner;
  now: () => Date;
};

export class GitHubReleaseClient implements ReleaseClient {
  constructor(private readonly owner: string, private readonly repo: string) {}

  async getLatestRelease(): Promise<LatestRelease | null> {
    const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'quanlysvJX-manager' }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub release check failed: ${response.status}`);
    const body = (await response.json()) as { tag_name: string; html_url: string; body: string | null };
    return { tagName: body.tag_name, htmlUrl: body.html_url, body: body.body };
  }
}

export class ProcessCommandRunner implements CommandRunner {
  async run(command: string, args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
      child.on('close', (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
    });
  }

  async stream(command: string, args: string[], cwd: string, onData: (line: string) => void): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false });
      child.stdout.on('data', (chunk) => onData(Buffer.from(chunk).toString('utf8')));
      child.stderr.on('data', (chunk) => onData(Buffer.from(chunk).toString('utf8')));
      child.on('close', (code) => resolve(code ?? 1));
    });
  }
}

export class UpdateService {
  private cachedStatus: UpdateStatus | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {}

  async getStatus(): Promise<UpdateStatus> {
    if (this.cachedStatus) return { ...this.cachedStatus, repoDirty: await this.isRepoDirty() };
    return this.checkForUpdates();
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    const [release, repoDirty] = await Promise.all([
      this.deps.releaseClient.getLatestRelease(),
      this.isRepoDirty()
    ]);
    const status: UpdateStatus = {
      currentVersion: this.deps.currentVersion,
      currentCommit: this.deps.currentCommit,
      latestVersion: release?.tagName ?? null,
      latestTag: release?.tagName ?? null,
      releaseUrl: release?.htmlUrl ?? null,
      releaseNotes: release?.body ?? null,
      hasUpdate: Boolean(release?.tagName && release.tagName !== this.deps.currentVersion),
      repoDirty,
      checkedAt: this.deps.now().toISOString()
    };
    this.cachedStatus = status;
    return status;
  }

  async runUpdate(onEvent: (event: UpdateEvent) => void = () => undefined): Promise<void> {
    const status = await this.checkForUpdates();
    if (status.repoDirty) throw new Error('Repository has uncommitted changes');
    if (!status.latestTag) throw new Error('No GitHub release found');
    this.assertSafeTag(status.latestTag);

    await this.streamStep('git', ['fetch', '--tags', 'origin'], onEvent);
    await this.streamStep('git', ['checkout', status.latestTag], onEvent);
    onEvent({ type: 'restarting', message: 'Rebuilding manager services' });
    await this.streamStep('docker', ['compose', 'up', '-d', '--build', 'api', 'ui'], onEvent);
  }

  private async isRepoDirty(): Promise<boolean> {
    const result = await this.deps.commandRunner.run('git', ['status', '--porcelain'], this.deps.projectRoot);
    if (result.code !== 0) throw new Error(result.stderr || 'Unable to read repository status');
    return result.stdout.trim().length > 0;
  }

  private async streamStep(command: string, args: string[], onEvent: (event: UpdateEvent) => void): Promise<void> {
    onEvent({ type: 'status', message: [command, ...args].join(' ') });
    const code = await this.deps.commandRunner.stream(command, args, this.deps.projectRoot, (message) => onEvent({ type: 'log', message }));
    if (code !== 0) throw new Error(`${command} ${args.join(' ')} failed with code ${code}`);
  }

  private assertSafeTag(tag: string): void {
    if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
      throw new Error('Release tag is not a valid semantic version');
    }
  }
}
```

- [ ] **Step 2: Run unit tests**

Run: `npm --workspace apps/api test -- updateService.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit service**

```bash
git add apps/api/src/services/updateService.ts apps/api/src/services/updateService.test.ts
git commit -m "feat: add self-update service"
```

---

### Task 3: API Update Routes

**Files:**
- Create: `apps/api/src/routes/updateRoutes.ts`
- Create: `apps/api/src/routes/updateRoutes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write route tests**

```ts
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
```

- [ ] **Step 2: Run route tests to verify fail**

Run: `npm --workspace apps/api test -- updateRoutes.test.ts`

Expected: FAIL with module not found for `./updateRoutes.js`.

- [ ] **Step 3: Implement routes**

```ts
import type { FastifyInstance, FastifyReply } from 'fastify';
import { success } from '../utils/response.js';
import { GitHubReleaseClient, ProcessCommandRunner, UpdateService, type UpdateEvent } from '../services/updateService.js';

function writeSse(reply: FastifyReply, event: UpdateEvent): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function registerUpdateRoutes(app: FastifyInstance, service?: UpdateService) {
  const updateService = service ?? new UpdateService({
    projectRoot: app.deps.config.hostProjectRoot ?? app.deps.config.projectRoot,
    currentVersion: process.env.APP_VERSION ?? '0.0.0-dev',
    currentCommit: process.env.APP_COMMIT ?? 'unknown',
    releaseClient: new GitHubReleaseClient('hungnt87', 'quanlysvJX'),
    commandRunner: new ProcessCommandRunner(),
    now: () => new Date()
  });

  app.get('/api/update/status', async (_request, reply) => reply.send(success(await updateService.getStatus())));
  app.post('/api/update/check', async (_request, reply) => reply.send(success(await updateService.checkForUpdates())));
  app.get('/api/update/run/stream', async (_request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    try {
      await updateService.runUpdate((event) => writeSse(reply, event));
    } catch (error) {
      writeSse(reply, { type: 'error', message: error instanceof Error ? error.message : 'Update failed' });
    } finally {
      reply.raw.end();
    }
  });
}
```

- [ ] **Step 4: Register routes in app**

Add import in `apps/api/src/app.ts`:

```ts
import { registerUpdateRoutes } from './routes/updateRoutes.js';
```

Add after `registerSystemRoutes(app);`:

```ts
  await registerUpdateRoutes(app);
```

- [ ] **Step 5: Run API tests**

Run: `npm --workspace apps/api test -- updateRoutes.test.ts updateService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit routes**

```bash
git add apps/api/src/routes/updateRoutes.ts apps/api/src/routes/updateRoutes.test.ts apps/api/src/app.ts
git commit -m "feat: expose self-update API"
```

---

### Task 4: Docker Runtime Wiring

**Files:**
- Modify: `docker-compose.yaml`
- Modify: `apps/api/Dockerfile`

- [ ] **Step 1: Update compose volume**

Change API volumes in `docker-compose.yaml` from:

```yaml
      - ./apps/jx-services:/workspace/apps/jx-services
```

to:

```yaml
      - .:/workspace
```

- [ ] **Step 2: Add build metadata args**

Add to `apps/api/Dockerfile` runtime stage before `ENV`:

```dockerfile
ARG APP_VERSION=0.0.0-dev
ARG APP_COMMIT=unknown
```

Extend `ENV` block:

```dockerfile
    MANAGER_PROJECT_ROOT=/workspace \
    APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT}
```

- [ ] **Step 3: Validate compose config**

Run: `docker compose config`

Expected: config renders with API volume `.:/workspace` and no YAML errors.

- [ ] **Step 4: Commit Docker wiring**

```bash
git add docker-compose.yaml apps/api/Dockerfile
git commit -m "chore: wire manager self-update runtime"
```

---

### Task 5: UI Update Service And Hook

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Create: `apps/ui/src/services/updateService.ts`
- Create: `apps/ui/src/hooks/useUpdateStatus.ts`

- [ ] **Step 1: Add UI types**

Append to `apps/ui/src/services/types.ts`:

```ts
export type UpdateStatus = {
  currentVersion: string;
  currentCommit: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  hasUpdate: boolean;
  repoDirty: boolean;
  checkedAt: string | null;
};

export type UpdateEvent =
  | { type: 'status'; message: string }
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'restarting'; message: string };
```

- [ ] **Step 2: Add update service**

```ts
import ApiService from './base/apiService';
import type { UpdateEvent, UpdateStatus } from './types';

export const updateService = {
  getStatus: async () => {
    const res = await ApiService.fetchData<any, UpdateStatus>({ url: '/api/update/status', method: 'GET' });
    return res.data;
  },
  checkNow: async () => {
    const res = await ApiService.fetchData<any, UpdateStatus>({ url: '/api/update/check', method: 'POST' });
    return res.data;
  },
  streamUpdate: (handlers: { onEvent: (event: UpdateEvent) => void; onDone: () => void; onError: (message: string) => void }) => {
    const source = new EventSource('/api/update/run/stream');
    source.onmessage = (message) => handlers.onEvent(JSON.parse(message.data) as UpdateEvent);
    source.onerror = () => {
      source.close();
      handlers.onError('Mất kết nối khi cập nhật');
    };
    return () => source.close();
  }
};
```

- [ ] **Step 3: Add hook**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateService } from '@/services/updateService';

export const updateKeys = {
  all: ['update'] as const,
  status: () => [...updateKeys.all, 'status'] as const
};

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: updateKeys.status(),
    queryFn: updateService.getStatus,
    refetchInterval: 6 * 60 * 60 * 1000
  });

  const checkMutation = useMutation({
    mutationFn: updateService.checkNow,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: updateKeys.all })
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    checkNow: checkMutation.mutateAsync,
    isChecking: checkMutation.isPending,
    streamUpdate: updateService.streamUpdate
  };
}
```

- [ ] **Step 4: Run UI typecheck/tests**

Run: `npm --workspace apps/ui test -- --run`

Expected: PASS or unrelated existing failures documented.

- [ ] **Step 5: Commit hook/service**

```bash
git add apps/ui/src/services/types.ts apps/ui/src/services/updateService.ts apps/ui/src/hooks/useUpdateStatus.ts
git commit -m "feat: add self-update client hook"
```

---

### Task 6: Settings Self-Update Panel

**Files:**
- Create: `apps/ui/src/views/settings/components/SelfUpdatePanel.tsx`
- Create: `apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx`
- Modify: `apps/ui/src/views/settings/index.tsx`

- [ ] **Step 1: Write component tests**

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { SelfUpdatePanel } from './SelfUpdatePanel';

vi.mock('@/hooks/useUpdateStatus', () => ({
  useUpdateStatus: () => ({
    status: {
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      latestVersion: 'v1.1.0',
      latestTag: 'v1.1.0',
      releaseUrl: 'url',
      releaseNotes: 'Notes',
      hasUpdate: true,
      repoDirty: false,
      checkedAt: '2026-06-24T10:00:00.000Z'
    },
    isLoading: false,
    checkNow: vi.fn(),
    isChecking: false,
    streamUpdate: vi.fn()
  })
}));

describe('SelfUpdatePanel', () => {
  it('shows update button when a newer release exists', () => {
    render(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cập nhật/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run component test to verify fail**

Run: `npm --workspace apps/ui test -- SelfUpdatePanel.test.tsx --run`

Expected: FAIL with missing `SelfUpdatePanel`.

- [ ] **Step 3: Implement panel**

```tsx
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';
import type { UpdateEvent } from '@/services/types';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function SelfUpdatePanel({ onSuccess, onError }: Props) {
  const { status, isLoading, checkNow, isChecking, streamUpdate } = useUpdateStatus();
  const [logs, setLogs] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleEvent = (event: UpdateEvent) => {
    setLogs((current) => [...current, event.message]);
    if (event.type === 'restarting') {
      onSuccess('Đang khởi động lại JX Manager');
      pollHealth();
    }
    if (event.type === 'error') onError(event.message);
  };

  const pollHealth = () => {
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          window.clearInterval(interval);
          window.location.reload();
        }
      } catch {
        // API is restarting.
      }
    }, 3000);
  };

  const handleUpdate = () => {
    setIsUpdating(true);
    setLogs([]);
    streamUpdate({
      onEvent: handleEvent,
      onDone: () => setIsUpdating(false),
      onError: (message) => {
        setIsUpdating(false);
        onError(message);
      }
    });
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>Cập nhật JX Manager</Title>
          {status?.hasUpdate ? <Badge color="orange">Có bản mới</Badge> : <Badge color="green">Mới nhất</Badge>}
        </Group>
        <Text size="sm">Hiện tại: {status?.currentVersion ?? 'Đang tải'}</Text>
        <Text size="sm">Mới nhất: {status?.latestVersion ?? 'Chưa có release'}</Text>
        {status?.repoDirty && <Alert color="red">Repo có thay đổi chưa commit. Hãy commit hoặc stash trước khi cập nhật.</Alert>}
        {status?.releaseNotes && <Text size="sm" c="dimmed">{status.releaseNotes}</Text>}
        <Group>
          <Button variant="light" loading={isChecking || isLoading} onClick={() => void checkNow()}>Kiểm tra lại</Button>
          <Button disabled={!status?.hasUpdate || status.repoDirty} loading={isUpdating} onClick={handleUpdate}>Cập nhật</Button>
        </Group>
        {logs.length > 0 && <Text component="pre" size="xs">{logs.join('\n')}</Text>}
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 4: Add panel to Settings**

Import in `apps/ui/src/views/settings/index.tsx`:

```tsx
import { SelfUpdatePanel } from './components/SelfUpdatePanel';
```

Render in Settings content near system/config panels:

```tsx
<SelfUpdatePanel onSuccess={onSuccess} onError={onError} />
```

- [ ] **Step 5: Run Settings tests**

Run: `npm --workspace apps/ui test -- SelfUpdatePanel.test.tsx SettingsView.test.tsx --run`

Expected: PASS after updating Settings test mocks if needed.

- [ ] **Step 6: Commit Settings panel**

```bash
git add apps/ui/src/views/settings/components/SelfUpdatePanel.tsx apps/ui/src/views/settings/components/SelfUpdatePanel.test.tsx apps/ui/src/views/settings/index.tsx
git commit -m "feat: add settings self-update panel"
```

---

### Task 7: Dashboard Update Banner

**Files:**
- Create: `apps/ui/src/views/dashboard/components/UpdateBanner.tsx`
- Create: `apps/ui/src/views/dashboard/components/UpdateBanner.test.tsx`
- Modify: `apps/ui/src/views/dashboard/index.tsx`

- [ ] **Step 1: Write banner test**

```tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

vi.mock('@/hooks/useUpdateStatus', () => ({
  useUpdateStatus: () => ({
    status: { currentVersion: 'v1.0.0', latestVersion: 'v1.1.0', hasUpdate: true, repoDirty: false },
    isLoading: false
  })
}));

describe('UpdateBanner', () => {
  it('shows release update link', () => {
    render(<UpdateBanner />);
    expect(screen.getByText(/có bản cập nhật/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /mở cài đặt/i })).toHaveAttribute('href', '/settings');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm --workspace apps/ui test -- UpdateBanner.test.tsx --run`

Expected: FAIL with missing `UpdateBanner`.

- [ ] **Step 3: Implement banner**

```tsx
import { Alert, Anchor, Group, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';

export function UpdateBanner() {
  const { status } = useUpdateStatus();
  if (!status?.hasUpdate) return null;

  return (
    <Alert color="orange" title="Có bản cập nhật JX Manager">
      <Group justify="space-between">
        <Text size="sm">{status.currentVersion} → {status.latestVersion}</Text>
        <Anchor component={Link} to="/settings">Mở cài đặt</Anchor>
      </Group>
    </Alert>
  );
}
```

- [ ] **Step 4: Render banner on dashboard**

Import in `apps/ui/src/views/dashboard/index.tsx`:

```tsx
import { UpdateBanner } from './components/UpdateBanner';
```

Render near the top of the dashboard stack:

```tsx
<UpdateBanner />
```

- [ ] **Step 5: Run dashboard tests**

Run: `npm --workspace apps/ui test -- UpdateBanner.test.tsx --run`

Expected: PASS.

- [ ] **Step 6: Commit banner**

```bash
git add apps/ui/src/views/dashboard/components/UpdateBanner.tsx apps/ui/src/views/dashboard/components/UpdateBanner.test.tsx apps/ui/src/views/dashboard/index.tsx
git commit -m "feat: notify dashboard about updates"
```

---

### Task 8: Final Verification

**Files:**
- Review all changed files.

- [ ] **Step 1: Run API test suite**

Run: `npm --workspace apps/api test -- --run`

Expected: PASS.

- [ ] **Step 2: Run UI test suite**

Run: `npm --workspace apps/ui test -- --run`

Expected: PASS.

- [ ] **Step 3: Run full build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Verify Docker config**

Run: `docker compose config`

Expected: PASS and API service has `.:/workspace` bind mount.

- [ ] **Step 5: Manual smoke test**

Run: `docker compose up -d --build api ui`

Expected:
- UI loads.
- `/api/update/status` returns JSON envelope.
- Settings update panel renders.
- Dashboard banner appears only when a mocked newer release exists.

- [ ] **Step 6: Final commit if needed**

```bash
git status --short
```

Expected: no uncommitted implementation files remain. If any generated or formatting changes remain, inspect them with `git diff`, then commit only verified project files with a specific message that describes those changes.

---

## Self-Review

- Spec coverage: release check, dirty gate, latest tag checkout, manager-only rebuild, SSE logs, health polling, dashboard banner, Settings panel, 6-hour cadence, always-enabled decision all mapped to tasks.
- Placeholder scan: no incomplete markers remain.
- Type consistency: `UpdateStatus`, `UpdateEvent`, route paths, hook names, and service names match across API and UI tasks.
- Risk note: `EventSource` cannot reliably emit `onDone` before API restart; UI relies on `restarting` event plus health polling, matching the design.
