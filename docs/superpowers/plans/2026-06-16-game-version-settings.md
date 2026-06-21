# Game Version Settings Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe game-version path settings with validation, `.env` persistence, startup health check, and UI recovery without blocking Settings access.

**Architecture:** Backend owns validation/persistence through a dedicated game-version-settings service and route module. Frontend adds a Settings tab component plus a startup guard that only gates game-dependent routes, so users can still reach Settings when the configured path is invalid.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest, React, Mantine, TanStack Query.

---

## Existing Context

- Current version management uses `apps/api/src/routes/versionRoutes.ts`, `VersionService`, `VersionRepository`, and registry files under `apps/jx-services/versions`.
- Current raw env editor uses `GET/POST /api/env` through `EnvService`, but new code must not overwrite arbitrary `.env` content.
- Current frontend Settings page owns version management at `apps/ui/src/views/settings/components/VersionManager.tsx`.
- Current `App.tsx` wraps providers and `RouterProvider`; startup guard must not make `/settings` unreachable.

## File Structure

**Backend create:**
- `apps/api/src/gameVersionSettings/requiredGameFiles.ts` — canonical required entries and type helpers.
- `apps/api/src/gameVersionSettings/gameVersionPathValidator.ts` — pure validation for candidate paths.
- `apps/api/src/gameVersionSettings/gameVersionEnv.ts` — immutable `.env` line patch/read helpers.
- `apps/api/src/services/gameVersionSettingsService.ts` — validates, saves, reads, startup-checks settings.
- `apps/api/src/controllers/gameVersionSettingsController.ts` — Fastify controller methods.
- `apps/api/src/routes/gameVersionSettingsRoutes.ts` — `/api/game-version-settings` route registration.
- `apps/api/src/gameVersionSettings/*.test.ts`, `apps/api/src/routes/gameVersionSettingsRoutes.test.ts` — backend tests.

**Backend modify:**
- `apps/api/src/app.ts` — register new routes.
- `apps/api/src/config.ts`, `apps/api/src/config.test.ts` — expose optional `gameVersionPath` and `gameVersionSubPath` loaded from env.

**Frontend create:**
- `apps/ui/src/services/gameVersionSettingsService.ts` — API client.
- `apps/ui/src/hooks/useGameVersionSettings.ts` — TanStack Query wrapper.
- `apps/ui/src/views/settings/components/GameVersionSettingsPanel.tsx` — settings UI.
- `apps/ui/src/components/GameVersionStartupGuard.tsx` — route-aware startup guard.
- `apps/ui/src/components/GameVersionErrorScreen.tsx` — recovery UI.
- Tests beside each new module where pattern already exists.

**Frontend modify:**
- `apps/ui/src/views/settings/index.tsx` — add settings panel/tab placement.
- `apps/ui/src/components/layout/DashboardLayout.tsx` — wrap routed page content with startup guard.
- `apps/ui/src/App.test.tsx` and `apps/ui/src/views/settings/SettingsView.test.tsx` — cover guard/settings recovery.

---

## API Contract

### `GET /api/game-version-settings`

Response `200`:
```json
{
  "status": "success",
  "data": {
    "gameVersionPath": "/host/game-version",
    "gameVersionSubPath": "server",
    "requiredFiles": ["goddes_y", "bishop_y", "server", "gateway"],
    "validation": { "isValid": true, "errors": [], "missingFiles": [] }
  }
}
```

### `POST /api/game-version-settings/validate`

Request:
```json
{ "gameVersionPath": "/host/game-version", "gameVersionSubPath": "" }
```

Response `200` for valid or invalid candidate; validation errors live in `data.validation`:
```json
{
  "status": "success",
  "data": {
    "gameVersionPath": "/host/game-version",
    "gameVersionSubPath": "",
    "requiredFiles": ["goddes_y", "bishop_y", "server", "gateway"],
    "validation": { "isValid": false, "errors": ["Thiếu mục bắt buộc: goddes_y"], "missingFiles": ["goddes_y"] }
  }
}
```

### `PUT /api/game-version-settings`

Request:
```json
{ "gameVersionPath": "/host/game-version", "gameVersionSubPath": "" }
```

Response `200` only after validation passes and `.env` is patched:
```json
{
  "status": "success",
  "data": {
    "gameVersionPath": "/host/game-version",
    "gameVersionSubPath": "",
    "requiredFiles": ["goddes_y", "bishop_y", "server", "gateway"],
    "validation": { "isValid": true, "errors": [], "missingFiles": [] }
  }
}
```

Response `400` if invalid:
```json
{
  "status": "error",
  "message": "Đường dẫn game version không hợp lệ: Thiếu mục bắt buộc: goddes_y"
}
```

### `GET /api/game-version-settings/startup-check`

Response `200`; never throws for missing setting/path. UI decides gate/error:
```json
{
  "status": "success",
  "data": {
    "configured": true,
    "ready": false,
    "settingsUrl": "/settings",
    "validation": { "isValid": false, "errors": ["Đường dẫn không tồn tại"], "missingFiles": [] }
  }
}
```

---

## Security Rules

- Accept absolute paths only.
- Normalize with `path.resolve` before validation.
- Reject path strings containing NUL bytes.
- Reject `gameVersionSubPath` that escapes root after resolution.
- Do not echo stack traces or filesystem exception internals to UI.
- Preserve existing `.env` lines; only patch `GAME_VERSION_PATH` and `GAME_VERSION_SUB_PATH`.
- Validation may check any absolute path entered by local admin; never list directory contents beyond required-file names.

---

## Task 1: Backend Required Files + Validator

**Files:**
- Create: `apps/api/src/gameVersionSettings/requiredGameFiles.ts`
- Create: `apps/api/src/gameVersionSettings/gameVersionPathValidator.ts`
- Create: `apps/api/src/gameVersionSettings/gameVersionPathValidator.test.ts`

- [ ] **Step 1: Write failing validator tests**

Create `apps/api/src/gameVersionSettings/gameVersionPathValidator.test.ts`:
```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateGameVersionPath } from './gameVersionPathValidator.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'game-version-settings-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function createRequiredEntries(base: string) {
  writeFileSync(path.join(base, 'goddes_y'), '');
  writeFileSync(path.join(base, 'bishop_y'), '');
  mkdirSync(path.join(base, 'server'));
  mkdirSync(path.join(base, 'gateway'));
}

describe('validateGameVersionPath', () => {
  it('rejects empty paths', () => {
    const result = validateGameVersionPath({ gameVersionPath: '' });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Đường dẫn game version không được để trống');
  });

  it('rejects relative paths', () => {
    const result = validateGameVersionPath({ gameVersionPath: './versions/mel' });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Đường dẫn game version phải là đường dẫn tuyệt đối');
  });

  it('rejects missing required entries', () => {
    const result = validateGameVersionPath({ gameVersionPath: root });

    expect(result.isValid).toBe(false);
    expect(result.missingFiles).toEqual(['goddes_y', 'bishop_y', 'server', 'gateway']);
  });

  it('accepts all required entries at root path', () => {
    createRequiredEntries(root);

    const result = validateGameVersionPath({ gameVersionPath: root });

    expect(result).toMatchObject({ isValid: true, errors: [], missingFiles: [] });
  });

  it('accepts required entries under safe sub path', () => {
    const target = path.join(root, 'release/server-files');
    mkdirSync(target, { recursive: true });
    createRequiredEntries(target);

    const result = validateGameVersionPath({ gameVersionPath: root, gameVersionSubPath: 'release/server-files' });

    expect(result).toMatchObject({ isValid: true, errors: [], missingFiles: [] });
  });

  it('rejects sub paths that escape root', () => {
    const result = validateGameVersionPath({ gameVersionPath: root, gameVersionSubPath: '../outside' });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Đường dẫn con không được thoát khỏi thư mục game version');
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/api test -- src/gameVersionSettings/gameVersionPathValidator.test.ts`

Expected: FAIL with module-not-found for `gameVersionPathValidator.js`.

- [ ] **Step 3: Add required files module**

Create `apps/api/src/gameVersionSettings/requiredGameFiles.ts`:
```typescript
export const REQUIRED_GAME_FILES = ['goddes_y', 'bishop_y', 'server', 'gateway'] as const;

export type RequiredGameFile = (typeof REQUIRED_GAME_FILES)[number];

export function getRequiredGameFiles(): readonly RequiredGameFile[] {
  return REQUIRED_GAME_FILES;
}
```

- [ ] **Step 4: Add validator implementation**

Create `apps/api/src/gameVersionSettings/gameVersionPathValidator.ts`:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_GAME_FILES } from './requiredGameFiles.js';

export type GameVersionPathInput = {
  gameVersionPath: string;
  gameVersionSubPath?: string;
};

export type GameVersionValidationResult = {
  isValid: boolean;
  errors: string[];
  missingFiles: string[];
  resolvedPath: string | null;
};

function invalid(errors: string[], missingFiles: string[] = [], resolvedPath: string | null = null): GameVersionValidationResult {
  return { isValid: false, errors, missingFiles, resolvedPath };
}

export function resolveGameVersionTarget(input: GameVersionPathInput): { rootPath: string; targetPath: string } | { error: string } {
  const trimmedRoot = input.gameVersionPath.trim();
  const trimmedSubPath = input.gameVersionSubPath?.trim() ?? '';

  if (!trimmedRoot) {
    return { error: 'Đường dẫn game version không được để trống' };
  }

  if (trimmedRoot.includes('\0') || trimmedSubPath.includes('\0')) {
    return { error: 'Đường dẫn game version không hợp lệ' };
  }

  if (!path.isAbsolute(trimmedRoot)) {
    return { error: 'Đường dẫn game version phải là đường dẫn tuyệt đối' };
  }

  const rootPath = path.resolve(trimmedRoot);
  const targetPath = path.resolve(rootPath, trimmedSubPath || '.');

  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    return { error: 'Đường dẫn con không được thoát khỏi thư mục game version' };
  }

  return { rootPath, targetPath };
}

export function validateGameVersionPath(input: GameVersionPathInput): GameVersionValidationResult {
  const resolved = resolveGameVersionTarget(input);
  if ('error' in resolved) {
    return invalid([resolved.error]);
  }

  const { targetPath } = resolved;

  if (!fs.existsSync(targetPath)) {
    return invalid(['Đường dẫn game version không tồn tại'], [], targetPath);
  }

  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return invalid(['Đường dẫn game version phải là thư mục'], [], targetPath);
  }

  try {
    fs.accessSync(targetPath, fs.constants.R_OK);
  } catch {
    return invalid(['Không có quyền đọc thư mục game version'], [], targetPath);
  }

  const missingFiles = REQUIRED_GAME_FILES.filter((requiredFile) => !fs.existsSync(path.join(targetPath, requiredFile)));
  const errors = missingFiles.map((requiredFile) => `Thiếu mục bắt buộc: ${requiredFile}`);

  return { isValid: missingFiles.length === 0, errors, missingFiles, resolvedPath: targetPath };
}
```

- [ ] **Step 5: Run GREEN test**

Run: `npm --workspace apps/api test -- src/gameVersionSettings/gameVersionPathValidator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/gameVersionSettings/requiredGameFiles.ts apps/api/src/gameVersionSettings/gameVersionPathValidator.ts apps/api/src/gameVersionSettings/gameVersionPathValidator.test.ts
git commit -m "feat: validate game version paths"
```

---

## Task 2: Backend Env Patch Helpers

**Files:**
- Create: `apps/api/src/gameVersionSettings/gameVersionEnv.ts`
- Create: `apps/api/src/gameVersionSettings/gameVersionEnv.test.ts`

- [ ] **Step 1: Write failing env helper tests**

Create `apps/api/src/gameVersionSettings/gameVersionEnv.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { patchGameVersionEnv, readGameVersionEnv } from './gameVersionEnv.js';

describe('gameVersionEnv', () => {
  it('reads existing game version values', () => {
    const result = readGameVersionEnv('A=1\nGAME_VERSION_PATH=/srv/game\nGAME_VERSION_SUB_PATH=server\n');

    expect(result).toEqual({ gameVersionPath: '/srv/game', gameVersionSubPath: 'server' });
  });

  it('patches only game version keys and preserves other lines', () => {
    const result = patchGameVersionEnv('A=1\nGAME_VERSION_PATH=/old\nB=2\n', {
      gameVersionPath: '/new',
      gameVersionSubPath: 'server'
    });

    expect(result).toBe('A=1\nGAME_VERSION_PATH=/new\nB=2\nGAME_VERSION_SUB_PATH=server\n');
  });

  it('removes sub path key when empty', () => {
    const result = patchGameVersionEnv('GAME_VERSION_PATH=/old\nGAME_VERSION_SUB_PATH=server\n', {
      gameVersionPath: '/new',
      gameVersionSubPath: ''
    });

    expect(result).toBe('GAME_VERSION_PATH=/new\n');
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/api test -- src/gameVersionSettings/gameVersionEnv.test.ts`

Expected: FAIL with module-not-found for `gameVersionEnv.js`.

- [ ] **Step 3: Add immutable env helpers**

Create `apps/api/src/gameVersionSettings/gameVersionEnv.ts`:
```typescript
export type GameVersionEnvValues = {
  gameVersionPath: string;
  gameVersionSubPath: string;
};

const PATH_KEY = 'GAME_VERSION_PATH';
const SUB_PATH_KEY = 'GAME_VERSION_SUB_PATH';

function parseLine(line: string): { key: string; value: string } | null {
  const index = line.indexOf('=');
  if (index <= 0) {
    return null;
  }
  return { key: line.slice(0, index), value: line.slice(index + 1) };
}

export function readGameVersionEnv(content: string): GameVersionEnvValues {
  const values = content.split('\n').reduce<GameVersionEnvValues>(
    (current, line) => {
      const parsed = parseLine(line);
      if (!parsed) {
        return current;
      }
      if (parsed.key === PATH_KEY) {
        return { ...current, gameVersionPath: parsed.value };
      }
      if (parsed.key === SUB_PATH_KEY) {
        return { ...current, gameVersionSubPath: parsed.value };
      }
      return current;
    },
    { gameVersionPath: '', gameVersionSubPath: '' }
  );

  return values;
}

export function patchGameVersionEnv(content: string, values: GameVersionEnvValues): string {
  const normalizedPath = values.gameVersionPath.trim();
  const normalizedSubPath = values.gameVersionSubPath.trim();
  const sourceLines = content.length > 0 ? content.split('\n').filter((line, index, lines) => index < lines.length - 1 || line.length > 0) : [];
  const withoutManagedKeys = sourceLines.filter((line) => {
    const parsed = parseLine(line);
    return parsed?.key !== PATH_KEY && parsed?.key !== SUB_PATH_KEY;
  });

  const nextLines = [
    ...withoutManagedKeys,
    `${PATH_KEY}=${normalizedPath}`,
    ...(normalizedSubPath ? [`${SUB_PATH_KEY}=${normalizedSubPath}`] : [])
  ];

  return `${nextLines.join('\n')}\n`;
}
```

- [ ] **Step 4: Run GREEN test**

Run: `npm --workspace apps/api test -- src/gameVersionSettings/gameVersionEnv.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/gameVersionSettings/gameVersionEnv.ts apps/api/src/gameVersionSettings/gameVersionEnv.test.ts
git commit -m "feat: patch game version env keys"
```

---

## Task 3: Backend Service + Routes

**Files:**
- Create: `apps/api/src/services/gameVersionSettingsService.ts`
- Create: `apps/api/src/controllers/gameVersionSettingsController.ts`
- Create: `apps/api/src/routes/gameVersionSettingsRoutes.ts`
- Create: `apps/api/src/routes/gameVersionSettingsRoutes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Create `apps/api/src/routes/gameVersionSettingsRoutes.test.ts`:
```typescript
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { ManagerConfig } from '../config.js';

let root: string;
let gameRoot: string;

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

function createRequiredEntries(base: string) {
  writeFileSync(path.join(base, 'goddes_y'), '');
  writeFileSync(path.join(base, 'bishop_y'), '');
  mkdirSync(path.join(base, 'server'));
  mkdirSync(path.join(base, 'gateway'));
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'game-version-routes-'));
  gameRoot = path.join(root, 'game-version');
  mkdirSync(gameRoot, { recursive: true });
  mkdirSync(path.join(root, 'apps/jx-services'), { recursive: true });
  writeFileSync(path.join(root, 'apps/jx-services/.env'), 'EXISTING=1\n', 'utf8');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('game version settings routes', () => {
  it('validates a candidate path without saving it', async () => {
    createRequiredEntries(gameRoot);
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/game-version-settings/validate',
      payload: { gameVersionPath: gameRoot, gameVersionSubPath: '' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.validation.isValid).toBe(true);
    expect(readFileSync(path.join(root, 'apps/jx-services/.env'), 'utf8')).toBe('EXISTING=1\n');
  });

  it('saves valid settings and preserves existing env keys', async () => {
    createRequiredEntries(gameRoot);
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/game-version-settings',
      payload: { gameVersionPath: gameRoot, gameVersionSubPath: '' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.validation.isValid).toBe(true);
    expect(readFileSync(path.join(root, 'apps/jx-services/.env'), 'utf8')).toBe(`EXISTING=1\nGAME_VERSION_PATH=${gameRoot}\n`);
  });

  it('rejects invalid settings without changing env', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/game-version-settings',
      payload: { gameVersionPath: gameRoot, gameVersionSubPath: '' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Đường dẫn game version không hợp lệ');
    expect(readFileSync(path.join(root, 'apps/jx-services/.env'), 'utf8')).toBe('EXISTING=1\n');
  });

  it('reports startup check as not configured when env has no path', async () => {
    const app = await buildApp({ config: testConfig(root) });

    const response = await app.inject({ method: 'GET', url: '/api/game-version-settings/startup-check' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ configured: false, ready: false, settingsUrl: '/settings' });
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/api test -- src/routes/gameVersionSettingsRoutes.test.ts`

Expected: FAIL with 404 for `/api/game-version-settings/validate`.

- [ ] **Step 3: Add service**

Create `apps/api/src/services/gameVersionSettingsService.ts`:
```typescript
import path from 'node:path';
import { EnvRepository } from '../repositories/envRepository.js';
import { patchGameVersionEnv, readGameVersionEnv } from '../gameVersionSettings/gameVersionEnv.js';
import { getRequiredGameFiles } from '../gameVersionSettings/requiredGameFiles.js';
import { validateGameVersionPath, type GameVersionValidationResult } from '../gameVersionSettings/gameVersionPathValidator.js';
import { ValidationError } from '../utils/errors.js';

export type GameVersionSettingsPayload = {
  gameVersionPath: string;
  gameVersionSubPath?: string;
};

export type GameVersionSettingsResponse = {
  gameVersionPath: string;
  gameVersionSubPath: string;
  requiredFiles: readonly string[];
  validation: GameVersionValidationResult;
};

export type GameVersionStartupCheck = {
  configured: boolean;
  ready: boolean;
  settingsUrl: '/settings';
  validation: GameVersionValidationResult;
};

export class GameVersionSettingsService {
  constructor(private readonly envRepository: EnvRepository) {}

  getSettings(): GameVersionSettingsResponse {
    const content = this.envRepository.exists() ? this.envRepository.read() : '';
    const values = readGameVersionEnv(content);
    return this.buildResponse(values);
  }

  validateSettings(payload: GameVersionSettingsPayload): GameVersionSettingsResponse {
    return this.buildResponse({
      gameVersionPath: payload.gameVersionPath,
      gameVersionSubPath: payload.gameVersionSubPath ?? ''
    });
  }

  saveSettings(payload: GameVersionSettingsPayload): GameVersionSettingsResponse {
    const response = this.validateSettings(payload);
    if (!response.validation.isValid) {
      throw new ValidationError(`Đường dẫn game version không hợp lệ: ${response.validation.errors.join('; ')}`);
    }

    const content = this.envRepository.exists() ? this.envRepository.read() : '';
    const nextContent = patchGameVersionEnv(content, {
      gameVersionPath: response.gameVersionPath,
      gameVersionSubPath: response.gameVersionSubPath
    });
    this.envRepository.write(nextContent);

    return response;
  }

  startupCheck(): GameVersionStartupCheck {
    const settings = this.getSettings();
    const configured = settings.gameVersionPath.trim().length > 0;
    return {
      configured,
      ready: configured && settings.validation.isValid,
      settingsUrl: '/settings',
      validation: settings.validation
    };
  }

  private buildResponse(values: { gameVersionPath: string; gameVersionSubPath: string }): GameVersionSettingsResponse {
    const normalized = {
      gameVersionPath: path.resolve(values.gameVersionPath.trim() || '/'),
      gameVersionSubPath: values.gameVersionSubPath.trim()
    };
    const validation = values.gameVersionPath.trim()
      ? validateGameVersionPath(normalized)
      : { isValid: false, errors: ['Chưa cấu hình đường dẫn game version'], missingFiles: [], resolvedPath: null };

    return {
      ...normalized,
      requiredFiles: getRequiredGameFiles(),
      validation
    };
  }
}
```

- [ ] **Step 4: Add controller**

Create `apps/api/src/controllers/gameVersionSettingsController.ts`:
```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GameVersionSettingsPayload, GameVersionSettingsService } from '../services/gameVersionSettingsService.js';
import { success } from '../utils/response.js';

export class GameVersionSettingsController {
  constructor(private readonly service: GameVersionSettingsService) {}

  async getSettings(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success(this.service.getSettings()));
  }

  async validateSettings(request: FastifyRequest<{ Body: GameVersionSettingsPayload }>, reply: FastifyReply) {
    return reply.send(success(this.service.validateSettings(request.body)));
  }

  async saveSettings(request: FastifyRequest<{ Body: GameVersionSettingsPayload }>, reply: FastifyReply) {
    return reply.send(success(this.service.saveSettings(request.body)));
  }

  async startupCheck(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success(this.service.startupCheck()));
  }
}
```

- [ ] **Step 5: Add routes**

Create `apps/api/src/routes/gameVersionSettingsRoutes.ts`:
```typescript
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameVersionSettingsController } from '../controllers/gameVersionSettingsController.js';
import { EnvRepository } from '../repositories/envRepository.js';
import { GameVersionSettingsService } from '../services/gameVersionSettingsService.js';
import { validate } from '../middleware/validate.js';

const gameVersionSettingsSchema = z.object({
  gameVersionPath: z.string().min(1, 'Đường dẫn game version không được để trống'),
  gameVersionSubPath: z.string().optional().default('')
});

export async function registerGameVersionSettingsRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, 'apps/jx-services/.env');
  const envRepository = new EnvRepository(envFilePath);
  const service = new GameVersionSettingsService(envRepository);
  const controller = new GameVersionSettingsController(service);

  app.get('/api/game-version-settings', (req, reply) => controller.getSettings(req, reply));
  app.get('/api/game-version-settings/startup-check', (req, reply) => controller.startupCheck(req, reply));
  app.post(
    '/api/game-version-settings/validate',
    { preHandler: validate({ body: gameVersionSettingsSchema }) },
    (req, reply) => controller.validateSettings(req as any, reply)
  );
  app.put(
    '/api/game-version-settings',
    { preHandler: validate({ body: gameVersionSettingsSchema }) },
    (req, reply) => controller.saveSettings(req as any, reply)
  );
}
```

- [ ] **Step 6: Register routes**

Modify `apps/api/src/app.ts`:
```typescript
import { registerGameVersionSettingsRoutes } from './routes/gameVersionSettingsRoutes.js';
```

Add next to other route registration calls:
```typescript
await registerGameVersionSettingsRoutes(app);
```

- [ ] **Step 7: Run GREEN route tests**

Run: `npm --workspace apps/api test -- src/routes/gameVersionSettingsRoutes.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/gameVersionSettingsService.ts apps/api/src/controllers/gameVersionSettingsController.ts apps/api/src/routes/gameVersionSettingsRoutes.ts apps/api/src/routes/gameVersionSettingsRoutes.test.ts apps/api/src/app.ts
git commit -m "feat: add game version settings api"
```

---

## Task 4: Config Support

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/config.test.ts`

- [ ] **Step 1: Add failing config test**

Append to `apps/api/src/config.test.ts`:
```typescript
it('loads game version settings from env', () => {
  const config = loadConfig({
    VITEST: 'true',
    GAME_VERSION_PATH: '/srv/game',
    GAME_VERSION_SUB_PATH: 'server'
  });

  expect(config.gameVersionPath).toBe('/srv/game');
  expect(config.gameVersionSubPath).toBe('server');
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/api test -- src/config.test.ts`

Expected: FAIL because `gameVersionPath` does not exist on `ManagerConfig`.

- [ ] **Step 3: Add config fields**

Modify `apps/api/src/config.ts` `ManagerConfig`:
```typescript
gameVersionPath?: string;
gameVersionSubPath?: string;
```

Add to `loadConfig` return object:
```typescript
gameVersionPath: env.GAME_VERSION_PATH,
gameVersionSubPath: env.GAME_VERSION_SUB_PATH,
```

- [ ] **Step 4: Run GREEN test**

Run: `npm --workspace apps/api test -- src/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/config.test.ts
git commit -m "feat: load game version config"
```

---

## Task 5: Frontend API Client + Hook

**Files:**
- Create: `apps/ui/src/services/gameVersionSettingsService.ts`
- Create: `apps/ui/src/services/gameVersionSettingsService.test.ts`
- Create: `apps/ui/src/hooks/useGameVersionSettings.ts`

- [ ] **Step 1: Write failing service test**

Create `apps/ui/src/services/gameVersionSettingsService.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';
import ApiService from './base/apiService';
import { gameVersionSettingsService } from './gameVersionSettingsService';

vi.mock('./base/apiService', () => ({
  default: { fetchData: vi.fn() }
}));

describe('gameVersionSettingsService', () => {
  it('calls startup check endpoint', async () => {
    vi.mocked(ApiService.fetchData).mockResolvedValueOnce({ data: { configured: false, ready: false, settingsUrl: '/settings', validation: { isValid: false, errors: [], missingFiles: [] } } });

    const result = await gameVersionSettingsService.startupCheck();

    expect(ApiService.fetchData).toHaveBeenCalledWith({ url: '/api/game-version-settings/startup-check', method: 'GET' });
    expect(result.ready).toBe(false);
  });

  it('saves settings with PUT', async () => {
    vi.mocked(ApiService.fetchData).mockResolvedValueOnce({ data: { gameVersionPath: '/srv/game', gameVersionSubPath: '', requiredFiles: [], validation: { isValid: true, errors: [], missingFiles: [] } } });

    await gameVersionSettingsService.saveSettings({ gameVersionPath: '/srv/game', gameVersionSubPath: '' });

    expect(ApiService.fetchData).toHaveBeenCalledWith({
      url: '/api/game-version-settings',
      method: 'PUT',
      data: { gameVersionPath: '/srv/game', gameVersionSubPath: '' }
    });
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/ui run vitest -- src/services/gameVersionSettingsService.test.ts`

Expected: FAIL with module-not-found for `gameVersionSettingsService`.

- [ ] **Step 3: Add service client**

Create `apps/ui/src/services/gameVersionSettingsService.ts`:
```typescript
import ApiService from './base/apiService';

export type GameVersionValidation = {
  isValid: boolean;
  errors: string[];
  missingFiles: string[];
  resolvedPath?: string | null;
};

export type GameVersionSettingsPayload = {
  gameVersionPath: string;
  gameVersionSubPath: string;
};

export type GameVersionSettings = GameVersionSettingsPayload & {
  requiredFiles: string[];
  validation: GameVersionValidation;
};

export type GameVersionStartupCheck = {
  configured: boolean;
  ready: boolean;
  settingsUrl: '/settings';
  validation: GameVersionValidation;
};

export const gameVersionSettingsService = {
  getSettings: async () => {
    const res = await ApiService.fetchData<any, GameVersionSettings>({ url: '/api/game-version-settings', method: 'GET' });
    return res.data;
  },
  validateSettings: async (data: GameVersionSettingsPayload) => {
    const res = await ApiService.fetchData<any, GameVersionSettings>({ url: '/api/game-version-settings/validate', method: 'POST', data });
    return res.data;
  },
  saveSettings: async (data: GameVersionSettingsPayload) => {
    const res = await ApiService.fetchData<any, GameVersionSettings>({ url: '/api/game-version-settings', method: 'PUT', data });
    return res.data;
  },
  startupCheck: async () => {
    const res = await ApiService.fetchData<any, GameVersionStartupCheck>({ url: '/api/game-version-settings/startup-check', method: 'GET' });
    return res.data;
  }
};
```

- [ ] **Step 4: Add query hook**

Create `apps/ui/src/hooks/useGameVersionSettings.ts`:
```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { gameVersionSettingsService, type GameVersionSettingsPayload } from '@/services/gameVersionSettingsService';

export const gameVersionSettingsKeys = {
  all: ['game-version-settings'] as const,
  detail: () => [...gameVersionSettingsKeys.all, 'detail'] as const,
  startup: () => [...gameVersionSettingsKeys.all, 'startup'] as const
};

export function useGameVersionSettings() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: gameVersionSettingsKeys.detail(),
    queryFn: gameVersionSettingsService.getSettings
  });
  const startupQuery = useQuery({
    queryKey: gameVersionSettingsKeys.startup(),
    queryFn: gameVersionSettingsService.startupCheck
  });
  const validateMutation = useMutation({ mutationFn: gameVersionSettingsService.validateSettings });
  const saveMutation = useMutation({
    mutationFn: (payload: GameVersionSettingsPayload) => gameVersionSettingsService.saveSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gameVersionSettingsKeys.all });
    }
  });

  return { settingsQuery, startupQuery, validateMutation, saveMutation };
}
```

- [ ] **Step 5: Run GREEN service test**

Run: `npm --workspace apps/ui run vitest -- src/services/gameVersionSettingsService.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/services/gameVersionSettingsService.ts apps/ui/src/services/gameVersionSettingsService.test.ts apps/ui/src/hooks/useGameVersionSettings.ts
git commit -m "feat: add game version settings client"
```

---

## Task 6: Frontend Settings Panel

**Files:**
- Create: `apps/ui/src/views/settings/components/GameVersionSettingsPanel.tsx`
- Create: `apps/ui/src/views/settings/components/GameVersionSettingsPanel.test.tsx`
- Modify: `apps/ui/src/views/settings/index.tsx`
- Modify: `apps/ui/src/views/settings/SettingsView.test.tsx`

- [ ] **Step 1: Write failing panel tests**

Create `apps/ui/src/views/settings/components/GameVersionSettingsPanel.test.tsx`:
```typescript
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameVersionSettingsPanel } from './GameVersionSettingsPanel';

const mockValidateSettings = vi.fn();
const mockSaveSettings = vi.fn();

vi.mock('@/hooks/useGameVersionSettings', () => ({
  useGameVersionSettings: () => ({
    settingsQuery: {
      data: {
        gameVersionPath: '/srv/game',
        gameVersionSubPath: '',
        requiredFiles: ['goddes_y', 'bishop_y', 'server', 'gateway'],
        validation: { isValid: false, errors: ['Thiếu mục bắt buộc: goddes_y'], missingFiles: ['goddes_y'] }
      },
      isLoading: false
    },
    validateMutation: { mutateAsync: mockValidateSettings, isPending: false, data: undefined },
    saveMutation: { mutateAsync: mockSaveSettings, isPending: false }
  })
}));

describe('GameVersionSettingsPanel', () => {
  it('validates and saves selected path', async () => {
    mockValidateSettings.mockResolvedValueOnce({ validation: { isValid: true, errors: [], missingFiles: [] } });
    mockSaveSettings.mockResolvedValueOnce({ validation: { isValid: true, errors: [], missingFiles: [] } });

    renderWithProviders(<GameVersionSettingsPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Đường dẫn game version'), { target: { value: '/srv/game' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu cài đặt' }));

    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalledWith({ gameVersionPath: '/srv/game', gameVersionSubPath: '' }));
  });

  it('shows required files and current validation errors', () => {
    renderWithProviders(<GameVersionSettingsPanel onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByText('goddes_y')).toBeTruthy();
    expect(screen.getByText('Thiếu mục bắt buộc: goddes_y')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/ui run vitest -- src/views/settings/components/GameVersionSettingsPanel.test.tsx`

Expected: FAIL with module-not-found for `GameVersionSettingsPanel`.

- [ ] **Step 3: Add panel component**

Create `apps/ui/src/views/settings/components/GameVersionSettingsPanel.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconDeviceFloppy, IconSearch } from '@tabler/icons-react';
import { useGameVersionSettings } from '@/hooks/useGameVersionSettings';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

export function GameVersionSettingsPanel({ onSuccess, onError }: Props) {
  const { settingsQuery, validateMutation, saveMutation } = useGameVersionSettings();
  const [gameVersionPath, setGameVersionPath] = useState('');
  const [gameVersionSubPath, setGameVersionSubPath] = useState('');
  const validation = validateMutation.data?.validation ?? settingsQuery.data?.validation;
  const requiredFiles = settingsQuery.data?.requiredFiles ?? [];

  useEffect(() => {
    if (settingsQuery.data) {
      setGameVersionPath(settingsQuery.data.gameVersionPath);
      setGameVersionSubPath(settingsQuery.data.gameVersionSubPath);
    }
  }, [settingsQuery.data]);

  const payload = { gameVersionPath, gameVersionSubPath };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={3}>Cài đặt game version</Title>
          <Text size="sm" c="dimmed">Chọn thư mục chứa đủ các mục bắt buộc trước khi lưu vào .env.</Text>
        </div>

        <TextInput
          label="Đường dẫn game version"
          placeholder="/home/user/jx/version"
          value={gameVersionPath}
          onChange={(event) => setGameVersionPath(event.currentTarget.value)}
        />
        <TextInput
          label="Đường dẫn con"
          placeholder="Để trống nếu file nằm ngay thư mục gốc"
          value={gameVersionSubPath}
          onChange={(event) => setGameVersionSubPath(event.currentTarget.value)}
        />

        <Group gap="xs">
          {requiredFiles.map((requiredFile) => <Badge key={requiredFile} variant="light">{requiredFile}</Badge>)}
        </Group>

        {validation && !validation.isValid ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} title="Game version chưa hợp lệ">
            <Stack gap={4}>{validation.errors.map((error) => <Text key={error} size="sm">{error}</Text>)}</Stack>
          </Alert>
        ) : null}
        {validation?.isValid ? <Alert color="green" icon={<IconCheck size={16} />}>Game version hợp lệ.</Alert> : null}

        <Group justify="flex-end">
          <Button
            variant="light"
            leftSection={<IconSearch size={16} />}
            loading={validateMutation.isPending}
            onClick={() => validateMutation.mutateAsync(payload).catch((error) => onError(error instanceof Error ? error.message : 'Kiểm tra thất bại'))}
          >
            Kiểm tra
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutateAsync(payload).then(() => onSuccess('Đã lưu cài đặt game version. Vui lòng restart dịch vụ nếu cần.')).catch((error) => onError(error instanceof Error ? error.message : 'Lưu thất bại'))}
          >
            Lưu cài đặt
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 4: Integrate into Settings view**

Modify `apps/ui/src/views/settings/index.tsx` by importing panel:
```typescript
import { GameVersionSettingsPanel } from './components/GameVersionSettingsPanel';
```

Render it in the version/settings area near `VersionManager`, passing existing `showSuccess`/`showError` callbacks:
```tsx
<GameVersionSettingsPanel onSuccess={showSuccess} onError={showError} />
```

- [ ] **Step 5: Run GREEN panel tests**

Run: `npm --workspace apps/ui run vitest -- src/views/settings/components/GameVersionSettingsPanel.test.tsx src/views/settings/SettingsView.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/views/settings/components/GameVersionSettingsPanel.tsx apps/ui/src/views/settings/components/GameVersionSettingsPanel.test.tsx apps/ui/src/views/settings/index.tsx apps/ui/src/views/settings/SettingsView.test.tsx
git commit -m "feat: add game version settings panel"
```

---

## Task 7: Frontend Startup Guard

**Files:**
- Create: `apps/ui/src/components/GameVersionErrorScreen.tsx`
- Create: `apps/ui/src/components/GameVersionStartupGuard.tsx`
- Create: `apps/ui/src/components/GameVersionStartupGuard.test.tsx`
- Modify: `apps/ui/src/components/layout/DashboardLayout.tsx`
- Modify: `apps/ui/src/App.test.tsx`

- [ ] **Step 1: Write failing guard tests**

Create `apps/ui/src/components/GameVersionStartupGuard.test.tsx`:
```typescript
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameVersionStartupGuard } from './GameVersionStartupGuard';

const mockUseLocation = vi.fn();
const mockStartupQuery = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useLocation: () => mockUseLocation() };
});

vi.mock('@/hooks/useGameVersionSettings', () => ({
  useGameVersionSettings: () => ({ startupQuery: mockStartupQuery() })
}));

describe('GameVersionStartupGuard', () => {
  it('renders children on settings route even when startup check fails', () => {
    mockUseLocation.mockReturnValue({ pathname: '/settings' });
    mockStartupQuery.mockReturnValue({ data: { configured: false, ready: false, validation: { errors: ['Chưa cấu hình'], missingFiles: [] } }, isLoading: false });

    renderWithProviders(<GameVersionStartupGuard><div>Settings content</div></GameVersionStartupGuard>);

    expect(screen.getByText('Settings content')).toBeTruthy();
  });

  it('shows recovery screen on game-dependent route when not ready', () => {
    mockUseLocation.mockReturnValue({ pathname: '/dashboard' });
    mockStartupQuery.mockReturnValue({ data: { configured: true, ready: false, validation: { errors: ['Đường dẫn không tồn tại'], missingFiles: [] } }, isLoading: false });

    renderWithProviders(<GameVersionStartupGuard><div>Dashboard content</div></GameVersionStartupGuard>);

    expect(screen.getByText('Không thể tải game version')).toBeTruthy();
    expect(screen.queryByText('Dashboard content')).toBeNull();
  });
});
```

- [ ] **Step 2: Run RED test**

Run: `npm --workspace apps/ui run vitest -- src/components/GameVersionStartupGuard.test.tsx`

Expected: FAIL with module-not-found for guard.

- [ ] **Step 3: Add error screen**

Create `apps/ui/src/components/GameVersionErrorScreen.tsx`:
```typescript
import { Alert, Button, Container, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

type Props = {
  errors: string[];
};

export function GameVersionErrorScreen({ errors }: Props) {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="md">
        <IconAlertTriangle size={48} color="var(--mantine-color-red-6)" />
        <Title order={2} ta="center">Không thể tải game version</Title>
        <Alert color="red" title="Chi tiết lỗi" w="100%">
          <Stack gap={4}>{errors.map((error) => <Text key={error} size="sm">{error}</Text>)}</Stack>
        </Alert>
        <Button component={Link} to="/settings">Mở cài đặt</Button>
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 4: Add startup guard**

Create `apps/ui/src/components/GameVersionStartupGuard.tsx`:
```typescript
import type { ReactNode } from 'react';
import { Container, Loader, Stack, Text } from '@mantine/core';
import { useLocation } from 'react-router-dom';
import { useGameVersionSettings } from '@/hooks/useGameVersionSettings';
import { GameVersionErrorScreen } from './GameVersionErrorScreen';

const RECOVERY_ROUTES = ['/settings'];

function isRecoveryRoute(pathname: string) {
  return RECOVERY_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function GameVersionStartupGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { startupQuery } = useGameVersionSettings();

  if (isRecoveryRoute(location.pathname)) {
    return <>{children}</>;
  }

  if (startupQuery.isLoading) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md"><Loader /><Text>Đang kiểm tra game version...</Text></Stack>
      </Container>
    );
  }

  if (startupQuery.data && !startupQuery.data.ready) {
    return <GameVersionErrorScreen errors={startupQuery.data.validation.errors} />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Wire guard into layout**

Modify `apps/ui/src/components/layout/DashboardLayout.tsx` by importing:
```typescript
import { GameVersionStartupGuard } from '@/components/GameVersionStartupGuard';
```

Wrap only routed page content, leaving layout navigation visible:
```tsx
<GameVersionStartupGuard>
  <Outlet />
</GameVersionStartupGuard>
```

Do not wrap `RouterProvider` in `App.tsx`; `GameVersionStartupGuard` uses `useLocation` and must render inside router context.

- [ ] **Step 6: Run GREEN guard tests**

Run: `npm --workspace apps/ui run vitest -- src/components/GameVersionStartupGuard.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src/components/GameVersionErrorScreen.tsx apps/ui/src/components/GameVersionStartupGuard.tsx apps/ui/src/components/GameVersionStartupGuard.test.tsx apps/ui/src/components/layout/DashboardLayout.tsx apps/ui/src/App.test.tsx
git commit -m "feat: guard startup game version loading"
```

---

## Task 8: Verification

**Files:**
- Whole project.

- [ ] **Step 1: Run targeted backend tests**

Run: `npm --workspace apps/api test -- src/gameVersionSettings/gameVersionPathValidator.test.ts src/gameVersionSettings/gameVersionEnv.test.ts src/routes/gameVersionSettingsRoutes.test.ts src/config.test.ts`

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests**

Run: `npm --workspace apps/ui run vitest -- src/services/gameVersionSettingsService.test.ts src/views/settings/components/GameVersionSettingsPanel.test.tsx src/components/GameVersionStartupGuard.test.tsx src/App.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 5: Run full tests if targeted checks pass**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit verification fixes only if needed**

```bash
git add -A
git commit -m "test: verify game version settings"
```

Skip commit if no files changed.

---

## Self-Review Checklist

- [ ] No fake startup loader or TODO-based behavior.
- [ ] Settings route remains accessible when game version path is missing/invalid.
- [ ] `.env` patch preserves unrelated keys.
- [ ] Invalid save fails fast and does not write `.env`.
- [ ] Validation tests cover empty, relative, missing, valid, and escaping subpath cases.
- [ ] UI tests cover validation/save and startup recovery.
- [ ] No unrelated refactor of existing version registry/upload/clone logic.
