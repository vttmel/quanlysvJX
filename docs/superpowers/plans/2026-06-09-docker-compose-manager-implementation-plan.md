# Docker Compose Manager Implementation Plan

Plan này triển khai spec tại `docs/superpowers/specs/2026-06-09-docker-compose-manager-design.md`.

## Nguyên tắc triển khai

- Làm theo từng lát nhỏ, mỗi lát có test hoặc verification rõ ràng.
- Backend là lớp duy nhất được gọi Docker/Compose và database commands.
- Không nhận command, path, service name tự do từ client.
- UI dùng Mantine từ `mantine.dev`; không tạo design system riêng khi Mantine có sẵn component phù hợp.
- Dev phục vụ app qua port `80` và cùng origin `/api`.

## Phase 1: Project Scaffold

Mục tiêu: tạo cấu trúc app đủ để chạy frontend/backend và test.

Việc cần làm:

- Tạo workspace Node trong repo, ưu tiên cấu trúc `apps/manager-api` và `apps/manager-web`.
- Cấu hình TypeScript, lint/test scripts, format scripts.
- Scaffold `manager-api` với HTTP server tối thiểu và health endpoint.
- Scaffold `manager-web` bằng React + Vite + TypeScript + Mantine.
- Thêm config dev proxy/reverse proxy để web gọi API qua `/api`.

Verification:

- `npm`/package manager install thành công.
- API health endpoint trả response chuẩn.
- Web render Mantine shell tối thiểu.
- Typecheck và test scaffold chạy được.

## Phase 2: Backend Core And Safe Command Runner

Mục tiêu: xây nền backend an toàn trước khi thêm action nguy hiểm.

Việc cần làm:

- Định nghĩa service allowlist theo compose hiện tại.
- Tạo module config đọc compose path, project root, backup directories, bind mode và schedule env.
- Tạo `CommandRunner` dùng argument array, không shell interpolate input client.
- Tạo API envelope `{ success, data, error }`.
- Tạo error mapping cho command failure, validation failure và unexpected error.
- Tạo audit logger local cho service/backup/restore actions.

Tests:

- Unit test service allowlist.
- Unit test command builder không nhận service ngoài allowlist.
- Unit test API envelope/error mapping.
- Unit test path guard chống path traversal.

## Phase 3: Service Status And Actions API

Mục tiêu: backend đọc trạng thái và điều khiển service compose hiện tại.

Việc cần làm:

- Implement `GET /api/services` bằng `docker compose ps --format json` hoặc fallback parser nếu format khác.
- Chuẩn hoá fields: `name`, `containerName`, `state`, `health`, `image`, `ports`, `startedAt`.
- Implement `POST /api/services/:name/start` bằng `docker compose up -d <service>`.
- Implement `POST /api/services/:name/stop` bằng `docker compose stop <service>`.
- Implement `POST /api/services/:name/restart` bằng `docker compose restart <service>`.
- Ghi audit event cho mọi action.

Tests:

- Unit test parser output compose ps.
- Integration test API bằng fake command runner.
- Test lỗi service không hợp lệ và command failure.

## Phase 4: Docker Logs API

Mục tiêu: xem Docker logs từng service an toàn.

Việc cần làm:

- Implement `GET /api/services/:name/logs?tail=300`.
- Validate `tail` trong giới hạn hợp lý, ví dụ 50-2000.
- Implement SSE `GET /api/services/:name/logs/stream?tail=100` nếu vẫn nằm trong scope sprint đầu.
- Dọn child process khi SSE client disconnect.

Tests:

- Unit test validate tail.
- Integration test logs API với fake stream.
- Test SSE cleanup bằng fake process nếu có SSE.

## Phase 5: Backup And Restore API

Mục tiêu: backup/restore MySQL và MSSQL chỉ từ thư mục quản lý.

Việc cần làm:

- Tạo backup directory `database/backups/mysql` cho MySQL nếu chưa có.
- Dùng thư mục MSSQL backup hiện có `database/mssql/data/database_backups`.
- Implement `GET /api/backups` liệt kê file hợp lệ, metadata cơ bản và loại DB.
- Implement `POST /api/backups/mysql` bằng `mysqldump` qua `docker compose exec` hoặc `docker exec` có argument cố định.
- Implement `POST /api/backups/mssql` bằng `sqlcmd` trong container `jxmssql`.
- Implement job state cho backup/restore dài.
- Implement `POST /api/restores/mysql` với xác nhận filename hợp lệ.
- Implement `POST /api/restores/mssql` với xác nhận filename hợp lệ và sequence restore cẩn trọng.
- Implement retention job theo `BACKUP_RETENTION_DAYS`.

Tests:

- Unit test backup filename generation.
- Unit test restore file validation chỉ cho file nằm trong backup dirs.
- Integration test backup/restore endpoint bằng fake runner.
- Manual test restore trên dữ liệu test trước khi dùng thật.

## Phase 6: Scheduler And Jobs

Mục tiêu: tự động backup theo env và hiển thị trạng thái thao tác dài.

Việc cần làm:

- Thêm scheduler đọc `BACKUP_SCHEDULE`.
- Thêm `BACKUP_RETENTION_DAYS`.
- Implement `GET /api/jobs`.
- Đảm bảo không chạy trùng backup cùng loại DB.
- Ghi audit event cho scheduled backup.

Tests:

- Unit test parse schedule/env defaults.
- Unit test lock chống job chạy trùng.
- Integration test jobs endpoint.

## Phase 7: Mantine Dashboard UI

Mục tiêu: dựng dashboard đã duyệt bằng Mantine.

Việc cần làm:

- Cấu hình Mantine provider, notifications và theme admin gọn.
- Dựng `AppShell` với header và main dashboard.
- Dựng service table với status/health badges và action buttons.
- Dựng confirmation modal cho stop/restart.
- Dựng logs panel với service selector, tail size, follow toggle và clear view.
- Dựng backup/restore panel với backup list, backup buttons và restore modal xác nhận kép.
- Dùng API client typed, xử lý loading/error states rõ ràng.

Tests:

- Component tests cho action modal và restore confirmation.
- E2E dashboard render service list từ mocked API hoặc test backend.
- E2E xem log, backup now, restore confirmation.

## Phase 8: Dev Port 80 And Production Compose

Mục tiêu: chạy đúng cách qua `localhost:80` và IP máy dev.

Việc cần làm:

- Thêm dev reverse proxy hoặc compose dev service bind `0.0.0.0:80`.
- Route `/` tới React app và `/api/*` tới backend.
- Thêm production compose/profile cho manager bind mặc định `127.0.0.1:80`.
- Ghi README vận hành: dev LAN mode, production localhost mode, cảnh báo không auth.
- Đảm bảo frontend không cần biết port API riêng.

Verification:

- Truy cập được `http://localhost:80`.
- Truy cập được `http://<ip-may-dev>:80` trong dev LAN mode.
- API gọi qua `/api` hoạt động cùng origin.
- Production config không expose rộng nếu không cấu hình lại.

## Phase 9: Final Verification And Review

Mục tiêu: kiểm tra đủ trước khi coi feature hoàn tất.

Việc cần làm:

- Chạy typecheck, lint, unit tests, integration tests.
- Chạy Playwright E2E cho flow chính.
- Review security: input validation, command runner, path guard, Docker socket exposure, no hardcoded new secrets.
- Review backup/restore command với dữ liệu test.
- Cập nhật README hoặc docs vận hành.
- Kiểm tra `git diff` trước commit cuối.

Done khi:

- Dashboard chạy ở port `80` theo dev requirement.
- Service actions hoạt động qua allowlist.
- Docker logs xem được theo service.
- Backup/restore cả MySQL và MSSQL đi qua thư mục quản lý.
- Restore có xác nhận kép.
- Test chính chạy qua và không có issue security nghiêm trọng.

## Thứ tự commit đề xuất

1. `chore: scaffold manager workspace`
2. `feat: add safe compose service api`
3. `feat: add docker logs api`
4. `feat: add database backup restore api`
5. `feat: add mantine manager dashboard`
6. `chore: add manager port 80 deployment`
7. `test: add manager verification coverage`
8. `docs: add manager operation guide`
