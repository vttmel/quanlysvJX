# Game Version JSON Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JSON-backed game version management with upload naming, rename, uploaded timestamps, duplicate prevention, and upload progress.

**Architecture:** Move version persistence into a focused backend registry module that owns `apps/jx-services/versions/versions.json`. Keep Docker compatibility by synchronizing the selected registry `serverPath` back to `.env` as `SERVER_PATH`.

**Tech Stack:** Fastify, Zod, Node filesystem APIs, React, Mantine, TanStack Query, XMLHttpRequest upload progress, Vitest.

---

### Task 1: Backend Registry Module

**Files:**
- Create: `apps/api/src/versions/versionRegistry.ts`
- Test: `apps/api/src/versions/versionRegistry.test.ts`

- [ ] Add tests for bootstrapping from directories, rejecting duplicate names, selecting versions, renaming versions, and keeping paths inside the version root.
- [ ] Implement registry read/write helpers with schema validation and atomic JSON writes.
- [ ] Run `npm --workspace apps/api run test -- versionRegistry` and verify the tests pass.

### Task 2: Version Routes

**Files:**
- Modify: `apps/api/src/routes/versionRoutes.ts`
- Test: `apps/api/src/routes/versionRoutes.test.ts`

- [ ] Add route tests for `GET /api/versions`, `POST /api/versions/upload` with `name`, `PATCH /api/versions/:name`, and duplicate-name failures.
- [ ] Replace directory-scanning route logic with `versionRegistry` calls.
- [ ] Keep `.env` synchronization through `SERVER_PATH` when selecting or renaming the active version.
- [ ] Replace unsafe shell-string archive commands with argument-based `spawnSync` calls.
- [ ] Run `npm --workspace apps/api run test` and verify API tests pass.

### Task 3: Frontend API Client And Types

**Files:**
- Modify: `apps/ui/src/services/types.ts`
- Modify: `apps/ui/src/services/client.ts`

- [ ] Add `GameVersion` and `VersionListResponse` types.
- [ ] Add `renameVersion` and `uploadVersionWithProgress` client functions.
- [ ] Keep existing `uploadVersion` callers migrated to the progress-aware function.

### Task 4: Version Manager UI

**Files:**
- Modify: `apps/ui/src/features/dashboard/VersionManager.tsx`
- Test: `apps/ui/src/features/dashboard/VersionManager.test.tsx`

- [ ] Replace direct `FileButton` upload with an upload modal containing version name, choose-file button, upload button, status text, and progress bar.
- [ ] Disable upload when the name is empty, file is missing, or the name duplicates an existing version.
- [ ] Add rename modal/action and show `uploadedAt` in the table.
- [ ] Run `npm --workspace apps/ui run test` and verify UI tests pass.

### Task 5: Verification

**Files:**
- Validate: `docker-compose.yaml`
- Validate: `apps/jx-services/versions/versions.json` generated at runtime only

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run test`.
- [ ] Run `docker compose config` and confirm manager path handling is unchanged.
