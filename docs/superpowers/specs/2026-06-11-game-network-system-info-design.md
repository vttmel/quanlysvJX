# Game Network And System Info Design

## Context

The manager already stores the active game version in `.env` and the JX container entrypoint rewrites game config files when containers start. The new feature should keep that model: the UI saves IP selections to `.env`, and running containers apply the values after restart.

## Requirements

- Add game IP configuration in `Cài đặt > Phiên bản game`.
- IP choices come from IPv4 addresses on the server running the manager API, plus `127.0.0.1`.
- Do not expose or save `auto` for game network env values.
- Save only to `.env`; do not directly edit mounted game config files from the UI.
- Allow saving while `jxserver`, `s3relay`, `bishop`, or `goddess` are running, but show that restart is required before the change takes effect.
- Show basic server information in the header: server time, server IP, MSSQL IP, and MySQL IP.
- Docker services should use host/server time by mounting host localtime.

## Architecture

Add a focused system route instead of making the UI parse raw `.env` content:

- `GET /api/system/info` returns:
  - server time and timezone from the API process host;
  - available IPv4 choices, deduplicated, with `127.0.0.1` included;
  - current game network env values: `JX_IP`, `JX_MYSQL_IP`, `JX_PAYSYS_IP`, `JX_MSSQL_IP`;
  - display IPs for header: selected server IP, MSSQL IP, and MySQL IP;
  - whether core JX services are currently running.
- `PUT /api/system/game-network` validates and saves the four game network values into `.env`.

The API owns env parsing and validation. Accepted values are IPv4 addresses that are either present in the server IP choices or `127.0.0.1`. `auto`, empty values, hostnames, and malformed IP strings are rejected for these fields.

## UI

Add a `GameNetworkConfigPanel` to the game version settings tab. The panel uses selects for:

- Game server IP: `JX_IP`
- MySQL IP: `JX_MYSQL_IP`
- Paysys IP: `JX_PAYSYS_IP`
- MSSQL IP: `JX_MSSQL_IP`

The panel loads choices and current values from `GET /api/system/info`. On save it calls `PUT /api/system/game-network`, invalidates system info, and shows a success notification. If any core JX service is running, the panel shows a restart-required warning before and after save.

Update the dashboard header with a compact, responsive system info group. It should poll system info periodically so server time and IP display remain current enough without requiring a page refresh.

## Docker Time Sync

Update `apps/jx-services/docker-compose.yaml` so every service mounts:

```yaml
- /etc/localtime:/etc/localtime:ro
```

This keeps container time aligned with the host server time. Existing `TZ` values can remain, but host localtime is the source of truth.

## Error Handling

- If system IP detection fails, return `127.0.0.1` as the fallback choice and keep the UI usable.
- If `.env` contains missing or legacy `auto` values, the API should return a sane selected fallback of `127.0.0.1` for the form while the raw save path replaces the env values with explicit IPs.
- Save failures return the existing API envelope error format and show a red notification in the UI.

## Testing

- API unit/integration tests for system info, IPv4 choice generation, rejection of `auto`, and `.env` updates.
- UI tests for rendering the game network panel, saving selected IPs, showing restart-required warning, and header system info display.
- Compose change is verified by inspecting generated compose config or focused snapshot/string assertion if the project already has compose tests.

