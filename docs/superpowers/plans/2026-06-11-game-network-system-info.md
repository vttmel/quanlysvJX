# Game Network System Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit game IP selection, header server info, and Docker host time sync without writing directly to mounted game config files.

**Architecture:** The API owns server IP detection, `.env` parsing/updating, validation, and service running state. The UI consumes a focused system endpoint through a small service/hook, renders a settings panel for game network env values, and shows compact system info in the header. Docker compose mounts host localtime into all services so container time follows the host server.

**Tech Stack:** Fastify, Node `os.networkInterfaces`, Zod, Vitest, React, Mantine, TanStack Query, Docker Compose.

---

## File Structure

- Create `apps/api/src/env/envFile.ts`: reusable `.env` read/write/update helpers, replacing duplicated private update logic where needed.
- Modify `apps/api/src/versions/versionRegistry.ts`: import `updateEnvKey` from `envFile.ts` instead of the private helper.
- Create `apps/api/src/system/systemInfo.ts`: server IPv4 choices, game network config normalization, payload validation, running-core-service detection.
- Create `apps/api/src/routes/systemRoutes.ts`: `GET /api/system/info` and `PUT /api/system/game-network`.
- Modify `apps/api/src/app.ts`: register system routes.
- Create `apps/api/src/env/envFile.test.ts`: tests env key update behavior.
- Create `apps/api/src/system/systemInfo.test.ts`: tests IP choices, fallback away from `auto`, and validation.
- Create `apps/api/src/routes/systemRoutes.test.ts`: route tests for info/save and running-service warning data.
- Modify `apps/ui/src/services/types.ts`: add system info and game network types.
- Create `apps/ui/src/services/systemService.ts`: API client for system routes.
- Create `apps/ui/src/hooks/useSystemInfo.ts`: TanStack Query keys, info query, save mutation.
- Create `apps/ui/src/views/settings/components/GameNetworkConfigPanel.tsx`: Mantine form/select panel.
- Modify `apps/ui/src/views/settings/components/VersionManager.tsx`: render the game network panel in the version tab.
- Create `apps/ui/src/views/settings/components/GameNetworkConfigPanel.test.tsx`: UI panel behavior tests.
- Modify `apps/ui/src/components/layout/DashboardLayout.tsx`: render header system info.
- Modify `apps/ui/src/components/layout/DashboardLayout.test.tsx`: header info test plus existing navbar persistence test.
- Modify `apps/jx-services/docker-compose.yaml`: add `/etc/localtime:/etc/localtime:ro` to every service volume list.

## Task 1: API Env Helpers

**Files:**
- Create: `apps/api/src/env/envFile.ts`
- Create: `apps/api/src/env/envFile.test.ts`
- Modify: `apps/api/src/versions/versionRegistry.ts`

- [ ] **Step 1: Write failing env helper tests**

Create `apps/api/src/env/envFile.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEnvMap, updateEnvKeys } from './envFile.js';

let root: string;
let envPath: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'env-file-'));
  envPath = path.join(root, '.env');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('envFile helpers', () => {
  it('reads simple env key values', () => {
    writeFileSync(envPath, 'JX_IP=192.168.1.20\nMSSQL_HOST=host.docker.internal\n', 'utf8');

    expect(readEnvMap(envPath)).toMatchObject({
      JX_IP: '192.168.1.20',
      MSSQL_HOST: 'host.docker.internal'
    });
  });

  it('updates existing keys and appends missing keys', () => {
    writeFileSync(envPath, 'SERVER_PATH=./apps/jx-services/versions/mel/server/\nJX_IP=auto\n', 'utf8');

    updateEnvKeys(envPath, {
      JX_IP: '127.0.0.1',
      JX_MYSQL_IP: '192.168.1.20'
    });

    expect(readFileSync(envPath, 'utf8')).toBe(
      'SERVER_PATH=./apps/jx-services/versions/mel/server/\n' +
        'JX_IP=127.0.0.1\n' +
        'JX_MYSQL_IP=192.168.1.20\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/api run test -- src/env/envFile.test.ts`

Expected: FAIL because `apps/api/src/env/envFile.ts` does not exist.

- [ ] **Step 3: Implement env helpers**

Create `apps/api/src/env/envFile.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function readEnvFile(envFilePath: string) {
  if (!existsSync(envFilePath)) {
    return '';
  }
  return readFileSync(envFilePath, 'utf8');
}

export function readEnvMap(envFilePath: string) {
  const values: Record<string, string> = {};
  for (const line of readEnvFile(envFilePath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    values[key] = line.slice(separatorIndex + 1).trim();
  }
  return values;
}

export function writeEnvFile(envFilePath: string, content: string) {
  mkdirSync(path.dirname(envFilePath), { recursive: true });
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  const tempPath = `${envFilePath}.tmp`;
  writeFileSync(tempPath, normalized, 'utf8');
  renameSync(tempPath, envFilePath);
}

export function updateEnvKey(envFilePath: string, key: string, value: string) {
  updateEnvKeys(envFilePath, { [key]: value });
}

export function updateEnvKeys(envFilePath: string, updates: Record<string, string>) {
  const seen = new Set<string>();
  const lines = readEnvFile(envFilePath).split(/\r?\n/);
  const nextLines = lines
    .filter((line, index) => !(index === lines.length - 1 && line === ''))
    .map((line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        return line;
      }
      const key = line.slice(0, separatorIndex).trim();
      if (!(key in updates)) {
        return line;
      }
      seen.add(key);
      return `${key}=${updates[key]}`;
    });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  writeEnvFile(envFilePath, nextLines.join('\n'));
}
```

- [ ] **Step 4: Replace private env update in version registry**

Modify `apps/api/src/versions/versionRegistry.ts` imports:

```ts
import { chmodSync, chownSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { updateEnvKey } from '../env/envFile.js';
```

Remove the existing private `updateEnvKey` function from the bottom of `versionRegistry.ts`. Keep all existing calls unchanged.

- [ ] **Step 5: Run tests**

Run: `npm --workspace apps/api run test -- src/env/envFile.test.ts src/versions/versionRegistry.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/env/envFile.ts apps/api/src/env/envFile.test.ts apps/api/src/versions/versionRegistry.ts
git commit -m "refactor: share env file updates"
```

## Task 2: API System Info Domain

**Files:**
- Create: `apps/api/src/system/systemInfo.ts`
- Create: `apps/api/src/system/systemInfo.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `apps/api/src/system/systemInfo.test.ts`:

```ts
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
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
      docker0: [{ address: '172.18.0.1', family: 'IPv4', internal: false }]
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/api run test -- src/system/systemInfo.test.ts`

Expected: FAIL because `systemInfo.ts` does not exist.

- [ ] **Step 3: Implement system info domain**

Create `apps/api/src/system/systemInfo.ts` with these exported shapes and functions:

```ts
import os, { type NetworkInterfaceInfo } from 'node:os';
import { z } from 'zod';
import { readEnvMap, updateEnvKeys } from '../env/envFile.js';

export const gameNetworkPayloadSchema = z.object({
  jxIp: z.string(),
  mysqlIp: z.string(),
  paysysIp: z.string(),
  mssqlIp: z.string()
});

export type GameNetworkConfig = z.infer<typeof gameNetworkPayloadSchema>;

export type CoreServiceState = {
  name: string;
  state: string;
};

export type SystemInfo = {
  serverTime: string;
  timezone: string;
  ipChoices: string[];
  serverIp: string;
  mysqlIp: string;
  mssqlIp: string;
  gameNetwork: GameNetworkConfig;
  coreServicesRunning: boolean;
  runningCoreServices: string[];
};

const fallbackIp = '127.0.0.1';
const coreServiceNames = new Set(['jxserver', 's3relay', 'bishop', 'goddess']);

export function getServerIpChoices(interfaces = os.networkInterfaces()) {
  const ips = new Set<string>([fallbackIp]);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (isIpv4Interface(entry)) {
        ips.add(entry.address);
      }
    }
  }
  return [...ips].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function normalizeGameNetworkConfig(env: Record<string, string | undefined>, ipChoices: string[]): GameNetworkConfig {
  return {
    jxIp: normalizeEnvIp(env.JX_IP, ipChoices),
    mysqlIp: normalizeEnvIp(env.JX_MYSQL_IP, ipChoices),
    paysysIp: normalizeEnvIp(env.JX_PAYSYS_IP, ipChoices),
    mssqlIp: normalizeEnvIp(env.JX_MSSQL_IP, ipChoices)
  };
}

export function validateGameNetworkPayload(payload: unknown, ipChoices: string[]) {
  const parsed = gameNetworkPayloadSchema.parse(payload);
  for (const value of Object.values(parsed)) {
    if (!ipChoices.includes(value)) {
      throw new Error('IP không hợp lệ. Vui lòng chọn IP từ danh sách server.');
    }
  }
  return parsed;
}

export function saveGameNetworkConfig(envFilePath: string, config: GameNetworkConfig) {
  updateEnvKeys(envFilePath, {
    JX_IP: config.jxIp,
    JX_MYSQL_IP: config.mysqlIp,
    JX_PAYSYS_IP: config.paysysIp,
    JX_MSSQL_IP: config.mssqlIp
  });
}

export function buildSystemInfo(options: {
  envFilePath: string;
  ipChoices?: string[];
  coreServices?: CoreServiceState[];
  now?: Date;
  timezone?: string;
}): SystemInfo {
  const ipChoices = options.ipChoices ?? getServerIpChoices();
  const env = readEnvMap(options.envFilePath);
  const gameNetwork = normalizeGameNetworkConfig(env, ipChoices);
  const runningCoreServices = (options.coreServices ?? [])
    .filter((service) => coreServiceNames.has(service.name) && ['running', 'starting'].includes(service.state))
    .map((service) => service.name);

  return {
    serverTime: (options.now ?? new Date()).toISOString(),
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ipChoices,
    serverIp: gameNetwork.jxIp,
    mysqlIp: gameNetwork.mysqlIp,
    mssqlIp: gameNetwork.mssqlIp,
    gameNetwork,
    coreServicesRunning: runningCoreServices.length > 0,
    runningCoreServices
  };
}

function normalizeEnvIp(value: string | undefined, ipChoices: string[]) {
  if (value && ipChoices.includes(value)) {
    return value;
  }
  return fallbackIp;
}

function isIpv4Interface(entry: NetworkInterfaceInfo) {
  return entry.family === 'IPv4' && Boolean(entry.address);
}
```

- [ ] **Step 4: Run domain tests**

Run: `npm --workspace apps/api run test -- src/system/systemInfo.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/system/systemInfo.ts apps/api/src/system/systemInfo.test.ts
git commit -m "feat: add system info domain"
```

## Task 3: API System Routes

**Files:**
- Create: `apps/api/src/routes/systemRoutes.ts`
- Create: `apps/api/src/routes/systemRoutes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/systemRoutes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/api run test -- src/routes/systemRoutes.test.ts`

Expected: FAIL with 404 for `/api/system/info` or missing module.

- [ ] **Step 3: Implement routes**

Create `apps/api/src/routes/systemRoutes.ts`:

```ts
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { ValidationError } from '../api/errors.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import { buildSystemInfo, getServerIpChoices, saveGameNetworkConfig, validateGameNetworkPayload } from '../system/systemInfo.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');

  app.get('/api/system/info', async () => {
    return ok(
      buildSystemInfo({
        envFilePath,
        ipChoices: getServerIpChoices(),
        coreServices: await readCoreServices(app)
      })
    );
  });

  app.put('/api/system/game-network', async (request) => {
    let payload;
    try {
      payload = validateGameNetworkPayload(request.body, getServerIpChoices());
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'IP không hợp lệ.');
    }

    saveGameNetworkConfig(envFilePath, payload);
    return ok({
      gameNetwork: payload,
      message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
    });
  });
}

async function readCoreServices(app: FastifyInstance) {
  const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
  if (result.exitCode !== 0) {
    return [];
  }
  return parseManagedServiceStatuses(result.stdout).map((service) => ({
    name: service.name,
    state: service.state
  }));
}
```

Modify `apps/api/src/app.ts` imports and registration:

```ts
import { registerSystemRoutes } from './routes/systemRoutes.js';
```

```ts
await registerSystemRoutes(app);
```

Place the registration near other read/config routes, before `registerVersionRoutes` is fine.

- [ ] **Step 4: Run route tests**

Run: `npm --workspace apps/api run test -- src/routes/systemRoutes.test.ts`

Expected: PASS.

- [ ] **Step 5: Run API typecheck and focused tests**

Run: `npm --workspace apps/api run typecheck`

Expected: PASS.

Run: `npm --workspace apps/api run test -- src/env/envFile.test.ts src/system/systemInfo.test.ts src/routes/systemRoutes.test.ts src/routes/versionRoutes.test.ts src/routes/serviceRoutes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/systemRoutes.ts apps/api/src/routes/systemRoutes.test.ts apps/api/src/app.ts
git commit -m "feat: add system info routes"
```

## Task 4: UI System Client And Settings Panel

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Create: `apps/ui/src/services/systemService.ts`
- Create: `apps/ui/src/hooks/useSystemInfo.ts`
- Create: `apps/ui/src/views/settings/components/GameNetworkConfigPanel.tsx`
- Create: `apps/ui/src/views/settings/components/GameNetworkConfigPanel.test.tsx`
- Modify: `apps/ui/src/views/settings/components/VersionManager.tsx`

- [ ] **Step 1: Write failing panel test**

Create `apps/ui/src/views/settings/components/GameNetworkConfigPanel.test.tsx`:

```tsx
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameNetworkConfigPanel } from './GameNetworkConfigPanel';

const mockSaveGameNetwork = vi.fn();

vi.mock('@/services/systemService', () => ({
  systemService: {
    getSystemInfo: vi.fn().mockResolvedValue({
      serverTime: '2026-06-11T08:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      ipChoices: ['127.0.0.1', '192.168.1.20'],
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      },
      coreServicesRunning: true,
      runningCoreServices: ['jxserver'],
    }),
    saveGameNetwork: (...args: unknown[]) => mockSaveGameNetwork(...args),
  },
}));

describe('GameNetworkConfigPanel', () => {
  beforeEach(() => {
    mockSaveGameNetwork.mockResolvedValue({
      message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows IP choices, excludes auto, warns about restart, and saves env values', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    expect(await screen.findByText('Cấu hình IP game')).toBeTruthy();
    expect(screen.getByText('jxserver')).toBeTruthy();
    expect(screen.queryByText('auto')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    await waitFor(() => {
      expect(mockSaveGameNetwork).toHaveBeenCalledWith({
        jxIp: '192.168.1.20',
        mysqlIp: '127.0.0.1',
        paysysIp: '127.0.0.1',
        mssqlIp: '192.168.1.20',
      });
      expect(onSuccess).toHaveBeenCalledWith('Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/ui run vitest -- src/views/settings/components/GameNetworkConfigPanel.test.tsx`

Expected: FAIL because `GameNetworkConfigPanel.tsx` does not exist.

- [ ] **Step 3: Add UI types and service**

Append to `apps/ui/src/services/types.ts`:

```ts
export type GameNetworkConfig = {
  jxIp: string;
  mysqlIp: string;
  paysysIp: string;
  mssqlIp: string;
};

export type SystemInfo = {
  serverTime: string;
  timezone: string;
  ipChoices: string[];
  serverIp: string;
  mysqlIp: string;
  mssqlIp: string;
  gameNetwork: GameNetworkConfig;
  coreServicesRunning: boolean;
  runningCoreServices: string[];
};

export type SaveGameNetworkResponse = {
  gameNetwork: GameNetworkConfig;
  message: string;
};
```

Create `apps/ui/src/services/systemService.ts`:

```ts
import ApiService from './base/apiService';
import type { GameNetworkConfig, SaveGameNetworkResponse, SystemInfo } from './types';

export const systemService = {
  getSystemInfo: async () => {
    const res = await ApiService.fetchData<any, SystemInfo>({
      url: '/api/system/info',
      method: 'GET',
    });
    return res.data;
  },
  saveGameNetwork: async (payload: GameNetworkConfig) => {
    const res = await ApiService.fetchData<GameNetworkConfig, SaveGameNetworkResponse>({
      url: '/api/system/game-network',
      method: 'PUT',
      data: payload,
    });
    return res.data;
  },
};
```

- [ ] **Step 4: Add system info hook**

Create `apps/ui/src/hooks/useSystemInfo.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { systemService } from '@/services/systemService';

export const systemKeys = {
  all: ['system'] as const,
  info: () => [...systemKeys.all, 'info'] as const,
};

export function useSystemInfo(options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: systemKeys.info(),
    queryFn: systemService.getSystemInfo,
    refetchInterval: options.refetchInterval,
  });
}

export function useSaveGameNetwork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: systemService.saveGameNetwork,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: systemKeys.all });
    },
  });
}
```

- [ ] **Step 5: Implement settings panel**

Create `apps/ui/src/views/settings/components/GameNetworkConfigPanel.tsx`:

```tsx
import { Alert, Button, Card, Group, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useSaveGameNetwork, useSystemInfo } from '@/hooks/useSystemInfo';
import type { GameNetworkConfig } from '@/services/types';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const fallbackConfig: GameNetworkConfig = {
  jxIp: '127.0.0.1',
  mysqlIp: '127.0.0.1',
  paysysIp: '127.0.0.1',
  mssqlIp: '127.0.0.1',
};

export function GameNetworkConfigPanel({ onSuccess, onError }: Props) {
  const { data, isLoading } = useSystemInfo();
  const saveMutation = useSaveGameNetwork();
  const [values, setValues] = useState<GameNetworkConfig>(fallbackConfig);

  useEffect(() => {
    if (data?.gameNetwork) {
      setValues(data.gameNetwork);
    }
  }, [data?.gameNetwork]);

  const ipOptions = useMemo(
    () => (data?.ipChoices ?? ['127.0.0.1']).map((ip) => ({ value: ip, label: ip })),
    [data?.ipChoices]
  );

  const setField = (field: keyof GameNetworkConfig, value: string | null) => {
    if (!value) return;
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    saveMutation.mutate(values, {
      onSuccess: (result) => onSuccess(result.message),
      onError: (error) => onError(error instanceof Error ? error.message : 'Không thể lưu cấu hình IP game'),
    });
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Cấu hình IP game</Title>
          <Text size="xs" c="dimmed">
            Lưu IP vào .env; restart dịch vụ để container áp dụng cấu hình mới.
          </Text>
        </div>

        {data?.coreServicesRunning && (
          <Alert color="yellow" title="Cần restart dịch vụ để áp dụng">
            Đang chạy: {data.runningCoreServices.join(', ')}
          </Alert>
        )}

        <Group grow align="flex-start">
          <Select label="Game server IP" data={ipOptions} value={values.jxIp} onChange={(value) => setField('jxIp', value)} disabled={isLoading || saveMutation.isPending} />
          <Select label="MySQL IP" data={ipOptions} value={values.mysqlIp} onChange={(value) => setField('mysqlIp', value)} disabled={isLoading || saveMutation.isPending} />
        </Group>
        <Group grow align="flex-start">
          <Select label="Paysys IP" data={ipOptions} value={values.paysysIp} onChange={(value) => setField('paysysIp', value)} disabled={isLoading || saveMutation.isPending} />
          <Select label="MSSQL IP" data={ipOptions} value={values.mssqlIp} onChange={(value) => setField('mssqlIp', value)} disabled={isLoading || saveMutation.isPending} />
        </Group>

        <Group justify="flex-end">
          <Button onClick={handleSave} loading={saveMutation.isPending} disabled={isLoading}>
            Lưu cấu hình IP
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 6: Render panel in version manager**

Modify `apps/ui/src/views/settings/components/VersionManager.tsx`:

```tsx
import { GameNetworkConfigPanel } from './GameNetworkConfigPanel';
```

Render it above the existing version management card or wrap the current card and panel in a fragment/stack:

```tsx
return (
  <Stack gap="md">
    <GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />
    <Card withBorder padding="md" radius="md">
      {/* existing content */}
    </Card>
  </Stack>
);
```

- [ ] **Step 7: Run UI panel tests**

Run: `npm --workspace apps/ui run vitest -- src/views/settings/components/GameNetworkConfigPanel.test.tsx src/views/settings/components/VersionManager.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/services/types.ts apps/ui/src/services/systemService.ts apps/ui/src/hooks/useSystemInfo.ts apps/ui/src/views/settings/components/GameNetworkConfigPanel.tsx apps/ui/src/views/settings/components/GameNetworkConfigPanel.test.tsx apps/ui/src/views/settings/components/VersionManager.tsx
git commit -m "feat: add game network settings panel"
```

## Task 5: Header System Info

**Files:**
- Modify: `apps/ui/src/components/layout/DashboardLayout.tsx`
- Modify: `apps/ui/src/components/layout/DashboardLayout.test.tsx`

- [ ] **Step 1: Add failing header test**

Modify `apps/ui/src/components/layout/DashboardLayout.test.tsx` with a `systemService` mock and a new test:

```tsx
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import DashboardLayout from './DashboardLayout';

vi.mock('@/services/systemService', () => ({
  systemService: {
    getSystemInfo: vi.fn().mockResolvedValue({
      serverTime: '2026-06-11T08:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      ipChoices: ['127.0.0.1', '192.168.1.20'],
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      gameNetwork: { jxIp: '192.168.1.20', mysqlIp: '127.0.0.1', paysysIp: '127.0.0.1', mssqlIp: '192.168.1.20' },
      coreServicesRunning: false,
      runningCoreServices: [],
    }),
  },
}));
```

Add:

```tsx
it('shows server time and IP summary in the header', async () => {
  renderWithProviders(<DashboardLayout />, { route: '/dashboard' });

  expect(await screen.findByText(/Server:/)).toBeTruthy();
  expect(screen.getByText(/192\.168\.1\.20/)).toBeTruthy();
  expect(screen.getByText(/MySQL:/)).toBeTruthy();
  expect(screen.getByText(/MSSQL:/)).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/ui run vitest -- src/components/layout/DashboardLayout.test.tsx`

Expected: FAIL because header does not render system info.

- [ ] **Step 3: Implement header info**

Modify `apps/ui/src/components/layout/DashboardLayout.tsx` imports:

```tsx
import { AppShell, Group, NavLink, Stack, Title, Burger, Tooltip, ActionIcon, Text } from '@mantine/core';
import { useSystemInfo } from '@/hooks/useSystemInfo';
```

Inside `DashboardLayout`:

```tsx
const systemInfo = useSystemInfo({ refetchInterval: 30000 });
```

Inside the header's right side `Group`, render:

```tsx
{systemInfo.data && (
  <Group gap="sm" visibleFrom="md" style={{ flexWrap: 'nowrap' }}>
    <Text size="xs" c="dimmed">Server: {formatServerTime(systemInfo.data.serverTime)}</Text>
    <Text size="xs" c="dimmed">IP: {systemInfo.data.serverIp}</Text>
    <Text size="xs" c="dimmed">MySQL: {systemInfo.data.mysqlIp}</Text>
    <Text size="xs" c="dimmed">MSSQL: {systemInfo.data.mssqlIp}</Text>
  </Group>
)}
```

Add helper at the bottom:

```tsx
function formatServerTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('vi-VN', { hour12: false });
}
```

- [ ] **Step 4: Run header test**

Run: `npm --workspace apps/ui run vitest -- src/components/layout/DashboardLayout.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/components/layout/DashboardLayout.tsx apps/ui/src/components/layout/DashboardLayout.test.tsx
git commit -m "feat: show system info in header"
```

## Task 6: Docker Host Time Sync

**Files:**
- Modify: `apps/jx-services/docker-compose.yaml`

- [ ] **Step 1: Inspect services without localtime mount**

Run: `rg -n "container_name:|/etc/localtime" apps/jx-services/docker-compose.yaml`

Expected: Some services do not have `/etc/localtime:/etc/localtime:ro`.

- [ ] **Step 2: Add host localtime mount to every service**

Modify `apps/jx-services/docker-compose.yaml` so each service has this volume entry:

```yaml
      - /etc/localtime:/etc/localtime:ro
```

For services that already have `volumes`, append it to that list. For services without a `volumes` block, add one before `networks`, `network_mode`, or `depends_on`, following the surrounding indentation.

- [ ] **Step 3: Verify every service has the mount**

Run: `docker compose -f apps/jx-services/docker-compose.yaml config`

Expected: command succeeds and normalized config contains `/etc/localtime:/etc/localtime:ro` for every service. If Docker is unavailable in the environment, run `rg -n "/etc/localtime:/etc/localtime:ro" apps/jx-services/docker-compose.yaml` and confirm the count matches the service count.

- [ ] **Step 4: Commit**

```bash
git add apps/jx-services/docker-compose.yaml
git commit -m "fix: sync docker container time with host"
```

## Task 7: Full Verification

**Files:**
- No new files expected; fix touched files only if verification finds issues.

- [ ] **Step 1: Run API checks**

Run: `npm --workspace apps/api run typecheck`

Expected: PASS.

Run: `npm --workspace apps/api run test`

Expected: PASS.

- [ ] **Step 2: Run UI checks**

Run: `npm --workspace apps/ui run typecheck`

Expected: PASS.

Run: `npm --workspace apps/ui run format:test`

Expected: PASS.

Run: `npm --workspace apps/ui run vitest`

Expected: PASS.

Run: `npm --workspace apps/ui run lint`

Expected: PASS, except the known unrelated `ServiceActionModal.tsx` regex warning if it still exists.

Run: `npm --workspace apps/ui run build`

Expected: PASS.

- [ ] **Step 3: Run root checks when focused checks pass**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run test`

Expected: PASS or the same known unrelated lint warning documented in Step 2.

- [ ] **Step 4: Review diff**

Run: `git diff --stat HEAD~6..HEAD`

Expected: only API system/env files, UI system panel/header files, compose, and tests are changed.

- [ ] **Step 5: Final implementation commit if verification required small fixes**

If verification fixes were needed:

```bash
git add <fixed-files>
git commit -m "fix: stabilize game network system info"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: Task 1-3 cover API `.env` save and no direct config file edits; Task 4 covers Settings game IP selection and no `auto`; Task 5 covers header server info; Task 6 covers Docker host time sync; Task 7 covers verification.
- Placeholder scan: The plan has no `TBD`, `TODO`, or deferred implementation notes. Each code task includes concrete file paths, code, commands, and expected outcomes.
- Type consistency: API uses `GameNetworkConfig` with `jxIp`, `mysqlIp`, `paysysIp`, `mssqlIp`; UI uses the same shape and maps it to `.env` keys only inside API domain code.

