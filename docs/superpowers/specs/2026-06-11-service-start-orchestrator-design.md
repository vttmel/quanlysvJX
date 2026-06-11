# Service Start Orchestrator Design

## Context

Dashboard hiện cho phép người dùng bấm Start từng service trong `apps/jx-services/docker-compose.yaml` và mở terminal trong modal để theo dõi tiến trình. API hiện có `GET /api/services/:name/start/stream`, nhưng luồng start còn gộp nhiều trách nhiệm vào một lệnh `docker compose up -d --build --no-deps <service>`. Cách này khó biết lỗi nằm ở phase kiểm tra image, pull, build, start hay chờ health.

Thiết kế này thêm một orchestrator phía API để start service theo từng phase rõ ràng, stream log/phases về UI, và chuẩn hóa lỗi để debug nhanh hơn.

## Goals

- Khi bấm Start, API kiểm tra image local trước.
- Nếu image đã tồn tại, bỏ qua bước chuẩn bị image.
- Nếu image thiếu và service có `build`, chạy build trước khi start.
- Nếu image thiếu và service chỉ dùng image ngoài, chạy pull trước khi start.
- Sau khi image sẵn sàng, chạy service bằng Docker Compose và để Compose xử lý dependency.
- Terminal trong modal hiển thị rõ phase, log Docker, mã lỗi và chi tiết lỗi.
- Modal chỉ tự đóng khi service người dùng chọn đạt trạng thái `running/healthy` hoặc `running` với service không có healthcheck.
- Timeout chờ readiness được tính từ healthcheck trong compose config.

## Non-Goals

- Không thêm job store bền vững để resume log sau khi đóng browser.
- Không thêm nút Rebuild riêng trong scope này.
- Không tự start/stop service bằng logic riêng ngoài Docker Compose dependency handling.
- Không thay đổi thứ tự phụ thuộc trong compose file.

## Recommended Approach

Dùng một orchestrator rõ phase trong API. Route SSE chỉ validate request và chuyển event ra client; phần kiểm tra compose config, image, build/pull, up và readiness polling nằm trong module riêng.

Các hướng khác đã cân nhắc:

- Chỉ dùng `docker compose up -d --build --pull missing <service>`: ít code nhưng khó chuẩn hóa lỗi theo phase.
- Tạo hệ thống job bất đồng bộ: bền hơn khi đóng/mở lại tab, nhưng lớn hơn nhu cầu hiện tại vì cần job store, cleanup và trạng thái job.

## Architecture

### `serviceRoutes.ts`

- Giữ route `GET /api/services/:name/start/stream`.
- Validate service bằng allowlist hiện có.
- Validate active version như hiện tại.
- Mở SSE response.
- Gọi `serviceStartOrchestrator` và forward event ra client.
- Khi client đóng kết nối trong lúc process còn chạy, hủy process đang chạy và emit/ghi nhận `STREAM_ABORTED` nếu còn có thể gửi event.

### `composeConfig.ts`

Module mới để resolve thông tin Docker Compose bằng lệnh:

```bash
docker compose --env-file .env -f apps/jx-services/docker-compose.yaml config --format json
```

Module này trả về metadata đã normalize cho service được chọn:

- `serviceName`
- `imageName`
- `hasBuild`
- `hasHealthcheck`
- `readinessTimeoutMs`

Trường hợp quan trọng: `s3relayserver` dùng `image: paysys`, nên `imageName` là `paysys`, không tự suy ra từ tên service.

### `serviceStartOrchestrator.ts`

Module mới điều phối pipeline:

1. `inspect`: đọc compose config và kiểm tra image local.
2. `prepare`: nếu image thiếu thì build hoặc pull.
3. `start`: chạy `docker compose up -d <service>`.
4. `wait-ready`: poll `docker compose ps --all --format json` tới khi service sẵn sàng hoặc timeout.

Orchestrator không trả raw HTTP response. Nó nhận callback/event emitter để route SSE có thể forward event theo cùng format.

### `composeRunner.ts`

Tiếp tục là lớp chạy Docker command không qua shell. Có thể bổ sung helper stream command dùng chung để orchestrator chạy `build`, `pull`, `up` và forward stdout/stderr.

## Data Flow

Luồng Start:

1. UI mở modal và tạo `EventSource` tới `/api/services/:name/start/stream`.
2. API emit `phase: inspect`.
3. API chạy `docker compose config --format json` để resolve image/build/healthcheck.
4. API kiểm tra image local bằng Docker image inspect.
   - Nếu Docker trả về "image not found", coi đây là trạng thái image thiếu và tiếp tục phase prepare.
   - Nếu Docker inspect lỗi vì nguyên nhân khác, emit `IMAGE_INSPECT_FAILED`.
5. Nếu image thiếu:
   - service có `build`: emit `phase: build`, chạy `docker compose build <service>`.
   - service không có `build`: emit `phase: pull`, chạy `docker compose pull <service>`.
6. API emit `phase: start`, chạy `docker compose up -d <service>` không dùng `--no-deps`.
7. API emit `phase: wait-ready`, poll service status.
8. Khi service sẵn sàng, API emit `ready` rồi `close`.
9. UI invalidate service query, thông báo thành công và đóng modal.

## SSE Events

### `phase`

Báo tiến trình đang ở phase nào.

```json
{ "phase": "inspect", "message": "Đang kiểm tra image paysys..." }
```

Các phase ban đầu:

- `inspect`
- `pull`
- `build`
- `start`
- `wait-ready`

### `log`

Forward stdout/stderr từ Docker command.

```json
{ "stream": "stderr", "message": "..." }
```

### `error`

Lỗi chuẩn hóa theo phase, không yêu cầu UI parse text log.

```json
{
  "code": "BUILD_FAILED",
  "phase": "build",
  "exitCode": 17,
  "message": "Build image paysys thất bại.",
  "detail": "docker stderr/stdout đã cắt gọn"
}
```

### `ready`

Service đã đạt trạng thái sẵn sàng.

```json
{
  "service": "paysys",
  "state": "running",
  "health": "healthy",
  "message": "Dịch vụ paysys đã sẵn sàng."
}
```

### `close`

Kết thúc stream. UI không dùng event này làm tín hiệu thành công; thành công thật là `ready`.

```json
{ "exitCode": 0 }
```

## Error Codes

- `COMPOSE_CONFIG_FAILED`: không đọc được compose config.
- `IMAGE_INSPECT_FAILED`: Docker image inspect lỗi vì nguyên nhân khác ngoài image chưa tồn tại.
- `PULL_FAILED`: pull image ngoài thất bại.
- `BUILD_FAILED`: build image local thất bại.
- `UP_FAILED`: `docker compose up -d` thất bại.
- `STATUS_CHECK_FAILED`: không đọc được trạng thái compose trong lúc poll.
- `HEALTH_TIMEOUT`: quá thời gian chờ service sẵn sàng.
- `START_ALREADY_RUNNING`: service đó đang có start process khác.
- `STREAM_ABORTED`: client đóng kết nối khi tiến trình còn chạy.

Mỗi lỗi nên có `code`, `phase`, `message`, `detail`, và `exitCode` nếu lỗi đến từ Docker process.

## Readiness And Timeout

Readiness kiểm tra service người dùng bấm Start, không yêu cầu tất cả dependency đạt ready trong API. Dependency do Docker Compose xử lý trong `up -d <service>`.

- Nếu service có healthcheck: thành công khi `state === "running"` và `health === "healthy"`.
- Nếu service không có healthcheck: thành công khi `state === "running"`.

Timeout lấy từ healthcheck trong `docker compose config --format json`:

```text
readinessTimeout = start_period + (interval + timeout) * retries + 15 seconds buffer
```

Nếu service không có healthcheck, dùng timeout mặc định 60 giây.

Parser duration chấp nhận cả chuỗi duration của Compose và giá trị numeric nếu Docker Compose trả về dạng đã normalize. Giá trị không parse được dùng default bảo thủ bên dưới thay vì làm fail toàn bộ start.

Nếu compose config thiếu một thành phần healthcheck, dùng default bảo thủ cho thành phần đó:

- `start_period`: 0 giây
- `interval`: 10 giây
- `timeout`: 5 giây
- `retries`: 30

## Concurrency

API giữ in-memory lock theo service name trong process API.

- Nếu cùng service đang start, request mới nhận `START_ALREADY_RUNNING` hoặc HTTP `409 Conflict` với cùng mã lỗi.
- Có thể start service khác cùng lúc, nhưng nếu Docker Compose tự phát sinh lỗi lock hoặc dependency conflict thì trả lỗi phase tương ứng, thường là `UP_FAILED`.
- UI vẫn disable action trong modal để giảm request trùng.

Lock được release khi orchestrator kết thúc thành công, thất bại hoặc bị abort.

## UI Behavior

`ServiceActionModal` tiếp tục là terminal theo dõi Start.

- Khi nhận `phase`, terminal in dòng hệ thống dễ đọc.
- Khi nhận `log`, terminal nối log sau khi strip ANSI như hiện tại.
- Khi nhận `error`, terminal in `code`, `message`, `detail`; toast hiển thị `code + message`; modal không đóng như success.
- Khi nhận `ready`, terminal in thông báo thành công, invalidate service query, rồi đóng modal sau một khoảng ngắn.
- Khi nhận `close` mà chưa có `ready`, UI không tự coi là thành công.

Stop và restart không nằm trong scope thay đổi chính. Restart có thể tiếp tục dùng API hiện tại trong bước đầu, hoặc sau này dùng lại orchestrator nếu cần thống nhất flow.

## Testing Plan

### API Unit Tests

- Resolve service dùng image ngoài: `jxmysql -> mysql:5.6`.
- Resolve service có build: `paysys -> image paysys`, `hasBuild=true`.
- Resolve service dùng lại image: `s3relayserver -> paysys`, `hasBuild=false`.
- Parse healthcheck timeout từ compose config.
- Image đã tồn tại thì bỏ qua build/pull.
- Image thiếu và service có build thì chạy build trước up.
- Image thiếu và service dùng image ngoài thì chạy pull trước up.
- Build/pull/up fail trả đúng mã lỗi và exitCode.
- Readiness timeout trả `HEALTH_TIMEOUT`.
- Lock trùng service trả `START_ALREADY_RUNNING`.

### API Route Tests

- Service không nằm trong allowlist bị reject.
- SSE emit event theo thứ tự cơ bản: `phase` -> `log` -> `ready` -> `close`.
- SSE emit `error` đúng shape khi orchestrator fail.
- Client close làm abort process đang chạy.

### UI Tests

- Modal hiển thị phase message.
- Modal append Docker log.
- Modal hiển thị error code/message/detail.
- Modal chỉ đóng khi nhận `ready`, không đóng chỉ vì `close`.

## Acceptance Criteria

- Bấm Start với image đã có không build/pull lại.
- Bấm Start với image local thiếu sẽ build nếu service có `build`.
- Bấm Start với image ngoài thiếu sẽ pull trước khi up.
- `docker compose up -d <service>` không dùng `--no-deps`.
- Terminal hiển thị phase và Docker log theo thời gian thực.
- Lỗi có mã chuẩn và exitCode nếu có.
- Modal tự đóng chỉ sau khi service được chọn sẵn sàng.
- Timeout readiness được tính từ healthcheck compose config.
- Tests mới bao phủ parser config, orchestrator, route SSE và UI modal behavior chính.
