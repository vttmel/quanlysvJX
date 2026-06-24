# JX Manager Self-Update Design

## Goal

JX Manager should notify administrators when a newer GitHub Release exists and let them update from the UI. The update flow pulls the latest release tag, rebuilds the manager containers, restarts them, and brings the UI back once the API is healthy.

## Decisions

- Update source: latest GitHub Release tag from `hungnt87/quanlysvJX`.
- Update trigger: user clicks an update button in the UI.
- Dirty repository policy: block updates when the local repository has uncommitted changes.
- Restart scope: rebuild and restart only manager services: `api` and `ui`.
- Progress UX: stream command logs with SSE, then poll `/api/health` while the API restarts.
- Notification surfaces: Dashboard banner and Settings update panel.
- Check cadence: on app open and every 6 hours, with manual “check again”.
- Current version source: build-injected version from `git describe --tags --always --dirty`, with fallback `0.0.0-dev+<sha>`.
- Self-update availability: always enabled.

## Architecture

Add a small update domain to the API with three responsibilities: release discovery, repository state checks, and update execution. The UI consumes that domain through a hook and service, renders a passive banner on the dashboard, and exposes the full update action in Settings.

The API must run commands against the host repository root. `docker-compose.yaml` should mount the full repository into `/workspace`, not only `apps/jx-services`, so the API container can run `git` and `docker compose` in the same project tree that launched the manager.

## API Design

### Endpoints

- `GET /api/update/status`
  - Returns cached release status and local repository state.
  - Refreshes stale release data when the last check is older than 6 hours.
- `POST /api/update/check`
  - Forces a GitHub Release check.
- `GET /api/update/run/stream`
  - Starts the update flow and streams progress as Server-Sent Events.

### Status Shape

```ts
type UpdateStatus = {
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
```

### SSE Event Shape

```ts
type UpdateEvent =
  | { type: 'status'; message: string }
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'restarting'; message: string };
```

The stream ends after emitting `restarting`, because the API container may be replaced by `docker compose up -d --build api ui`.

## Update Flow

1. API checks `git status --porcelain` in `MANAGER_PROJECT_ROOT`.
2. If dirty, API emits an error and stops before any update command runs.
3. API fetches tags from `origin`.
4. API resolves the latest release tag from GitHub Releases.
5. API checks out the tag with `git checkout <tag>`.
6. API runs `docker compose up -d --build api ui` from the repository root.
7. UI switches to restart mode and polls `/api/health` until it succeeds.
8. UI reloads the page after the API is healthy.

## UI Design

### Dashboard Banner

Show a compact banner when `hasUpdate` is true:

- Current version.
- Latest release version.
- Link to Settings update panel.

### Settings Update Panel

Add a panel to Settings for update management:

- Current version and latest version.
- Release notes summary.
- Dirty repository warning when `repoDirty` is true.
- “Kiểm tra lại” button.
- “Cập nhật” button when `hasUpdate` is true and `repoDirty` is false.
- Streaming log area while updating.
- Restart state with health polling.

## Error Handling

- GitHub unavailable: keep current status, show “Không kiểm tra được bản mới”.
- No releases found: show current version and “Chưa có release trên GitHub”.
- Dirty repository: block update and tell user to commit or stash local changes.
- Git fetch or checkout failure: stream command output and keep the UI on the update panel.
- Docker build failure: stream command output; user can retry after fixing logs.
- API restart timeout: show manual recovery command `docker compose up -d --build api ui`.

## Security Notes

Self-update is intentionally always enabled per product decision. This gives any caller that can access the API the ability to trigger `git` and `docker compose` commands. The implementation must still avoid shell interpolation by using argument arrays, validate release tags before checkout, run commands only inside `MANAGER_PROJECT_ROOT`, and never accept arbitrary command input from the UI.

## Testing Strategy

- Unit test release comparison and status mapping.
- Unit test dirty repository blocking.
- API integration test for `/api/update/status` with mocked GitHub and git runner.
- API integration test for SSE update flow with mocked command runner.
- UI hook tests for status, manual check, and stream handling.
- Component tests for dashboard banner and Settings update panel states.

## Out of Scope

- Authentication and role-based access control.
- Rollback to previous releases.
- Updating game server versions under `apps/jx-services/versions`.
- Supporting release asset downloads instead of git tags.
- Updating all Docker services beyond `api` and `ui`.

## Open Risks

- The API may disappear before all final logs flush when Docker replaces the container.
- GitHub API rate limits can affect repeated manual checks.
- Checkout to a tag leaves the repo in detached HEAD, which is acceptable for release-based deployment but should be documented in troubleshooting.
