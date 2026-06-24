# JX Manager JSON Version Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quản lý thông tin phiên bản của JX Manager bằng file `version.json` cục bộ tại thư mục gốc của dự án thay vì chỉ sử dụng biến môi trường Docker, đồng thời tự động fallback về ENV nếu file không tồn tại.

**Architecture:** Nâng cấp `UpdateService` trong backend API để khi khởi chạy, nó sẽ tìm và đọc thông tin từ file `version.json` ở thư mục `projectRoot`. Tạo file `version.json` mẫu ở gốc dự án. Cập nhật các unit test tương ứng để verify cơ chế đọc file JSON này.

**Tech Stack:** Node.js fs, Fastify, TypeScript, Vitest.

---

## File Structure

- [MODIFY] [updateService.ts](file:///home/hungnt/dev/quanlysvJX/apps/api/src/services/updateService.ts): Nâng cấp constructor và logic lấy thông tin phiên bản cục bộ bằng cách đọc file `version.json`.
- [MODIFY] [updateService.test.ts](file:///home/hungnt/dev/quanlysvJX/apps/api/src/services/updateService.test.ts): Bổ sung các test case kiểm tra việc đọc file JSON và fallback về ENV.
- [NEW] [version.json](file:///home/hungnt/dev/quanlysvJX/version.json): File chứa phiên bản JX Manager hiện hành cục bộ.

---

### Task 1: API Update Service Tests Update

**Files:**
- Modify: `apps/api/src/services/updateService.test.ts`

- [ ] **Step 1: Viết test case chứng minh lỗi (failing tests)**

Thêm các test case kiểm tra việc đọc file `version.json` và fallback về ENV khi file không tồn tại.

Sử dụng `replace_file_content` sửa đổi `apps/api/src/services/updateService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { UpdateService } from './updateService.js';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('UpdateService', () => {
  it('reads current version from version.json if the file exists', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('version.json'));
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      version: 'v1.0.5-json',
      commit: 'json123'
    }));

    const service = new UpdateService({
      projectRoot: '/workspace',
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: 'v1.1.0',
          htmlUrl: 'url',
          body: ''
        })
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        stream: vi.fn()
      },
      now: () => new Date('2026-06-24T10:00:00.000Z')
    });

    const status = await service.getStatus();
    expect(status.currentVersion).toBe('v1.0.5-json');
    expect(status.currentCommit).toBe('json123');
  });

  it('falls back to environment variables when version.json does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.APP_VERSION = 'v1.0.0-env';
    process.env.APP_COMMIT = 'env123';

    const service = new UpdateService({
      projectRoot: '/workspace',
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: 'v1.1.0',
          htmlUrl: 'url',
          body: ''
        })
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        stream: vi.fn()
      },
      now: () => new Date('2026-06-24T10:00:00.000Z')
    });

    const status = await service.getStatus();
    expect(status.currentVersion).toBe('v1.0.0-env');
    expect(status.currentCommit).toBe('env123');
  });
});
```

- [ ] **Step 2: Chạy kiểm thử để xác nhận lỗi**

Run: `npm --workspace apps/api test -- updateService.test.ts`

Expected: FAIL do hàm mock và `UpdateService` chưa triển khai tính năng đọc file JSON trong constructor.

- [ ] **Step 3: Commit các test case hỏng**

```bash
git add apps/api/src/services/updateService.test.ts
git commit -m "test: specify json version loading and env fallback"
```

---

### Task 2: API Update Service Update

**Files:**
- Modify: `apps/api/src/services/updateService.ts`

- [ ] **Step 1: Cập nhật cấu trúc constructor và logic đọc version trong UpdateService**

Sử dụng `replace_file_content` sửa đổi `apps/api/src/services/updateService.ts`:

```typescript
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Cập nhật type UpdateServiceDeps, biến currentVersion và currentCommit là tùy chọn
type UpdateServiceDeps = {
  projectRoot: string;
  currentVersion?: string;
  currentCommit?: string;
  releaseClient: ReleaseClient;
  commandRunner: CommandRunner;
  now: () => Date;
};
```

Thêm hàm `getLocalVersion` và sử dụng trong logic `checkForUpdates`:

```typescript
export class UpdateService {
  private cachedStatus: UpdateStatus | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {}

  private getLocalVersion(): { version: string; commit: string } {
    const versionFilePath = path.join(this.deps.projectRoot, 'version.json');
    let version = this.deps.currentVersion ?? process.env.APP_VERSION ?? '0.0.0-dev';
    let commit = this.deps.currentCommit ?? process.env.APP_COMMIT ?? 'unknown';

    if (fs.existsSync(versionFilePath)) {
      try {
        const raw = fs.readFileSync(versionFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.version) version = data.version;
        if (data.commit) commit = data.commit;
      } catch {
        // Fallback
      }
    }
    return { version, commit };
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    const [release, repoDirty] = await Promise.all([
      this.deps.releaseClient.getLatestRelease(),
      this.isRepoDirty()
    ]);
    const { version, commit } = this.getLocalVersion();
    const status: UpdateStatus = {
      currentVersion: version,
      currentCommit: commit,
      latestVersion: release?.tagName ?? null,
      latestTag: release?.tagName ?? null,
      releaseUrl: release?.htmlUrl ?? null,
      releaseNotes: release?.body ?? null,
      hasUpdate: Boolean(release?.tagName && release.tagName !== version),
      repoDirty,
      checkedAt: this.deps.now().toISOString()
    };
    this.cachedStatus = status;
    return status;
  }
```

- [ ] **Step 2: Chạy kiểm thử tự động**

Run: `npm --workspace apps/api test -- updateService.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit code service**

```bash
git add apps/api/src/services/updateService.ts
git commit -m "feat: read current manager version from local version.json"
```

---

### Task 3: API Update Routes Update

**Files:**
- Modify: `apps/api/src/routes/updateRoutes.ts`

- [ ] **Step 1: Cập nhật route khởi tạo**

Bỏ các tham số `currentVersion` và `currentCommit` truyền cứng từ biến môi trường bên ngoài router để `UpdateService` tự quản lý và đọc động từ `projectRoot`.

Sử dụng `replace_file_content` sửa đổi `apps/api/src/routes/updateRoutes.ts`:

```typescript
export async function registerUpdateRoutes(app: FastifyInstance, service?: UpdateService) {
  const updateService = service ?? new UpdateService({
    projectRoot: app.deps.config.hostProjectRoot ?? app.deps.config.projectRoot,
    releaseClient: new GitHubReleaseClient('hungnt87', 'quanlysvJX'),
    commandRunner: new ProcessCommandRunner(),
    now: () => new Date()
  });
```

- [ ] **Step 2: Chạy kiểm thử toàn bộ API routes và services**

Run: `npm --workspace apps/api test -- updateRoutes.test.ts updateService.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit router**

```bash
git add apps/api/src/routes/updateRoutes.ts
git commit -m "chore: delegate local version configuration to update service"
```

---

### Task 4: Tạo file version.json ở gốc dự án

**Files:**
- Create: `version.json`

- [ ] **Step 1: Tạo file version.json**

Tạo file `version.json` ở thư mục gốc `/home/hungnt/dev/quanlysvJX/version.json` với dữ liệu cấu hình ban đầu:

```json
{
  "version": "v1.0.0",
  "commit": "unknown"
}
```

- [ ] **Step 2: Commit file JSON**

```bash
git add version.json
git commit -m "chore: add default version.json file"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Chạy API test suite**

Run: `npm --workspace apps/api test -- --run`

Expected: PASS.

- [ ] **Step 2: Chạy UI test suite**

Run: `npm --workspace apps/ui test`

Expected: PASS.

- [ ] **Step 3: Chạy full build dự án**

Run: `npm run build`

Expected: PASS.
