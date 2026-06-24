# GitHub Self-Update Job Design

## Mục tiêu

Tối ưu luồng **Cập nhật hệ thống từ GitHub** theo hướng ổn định và dễ debug. Người dùng có thể bấm cập nhật, theo dõi tiến trình, reload trang hoặc API/UI restart mà vẫn xem lại được trạng thái, log, lỗi và kết quả cuối cùng.

## Vấn đề hiện tại

Luồng hiện tại phụ thuộc nhiều vào một kết nối SSE duy nhất. Khi API/UI restart, SSE bị ngắt, UI phải đoán trạng thái bằng health/status polling. Các lỗi mount, thiếu `.env`, build fail hoặc compose fail khó truy vết vì log không được lưu thành job bền vững. Nếu reload sau restart, UI dễ mất context của lần cập nhật vừa chạy.

## Phạm vi

Thiết kế này chỉ tối ưu self-update của JX Manager từ GitHub release. Không làm rollback tự động ở phase này. Không đổi sang GHCR/prebuilt image. Không cho chạy nhiều update song song.

## Kiến trúc

Thêm mô hình **update job** có `runId`, trạng thái, stage, log và release snapshot. API lưu job vào file JSON tại `apps/jx-services/mount/update/update-runs.json` trong repo host để dữ liệu còn sau reload/restart container.

UI không còn coi SSE là nguồn sự thật duy nhất. UI start hoặc nối lại job qua API, stream log realtime nếu được, đồng thời đọc trạng thái job bằng endpoint REST để resume sau reload.

## Data model

File `update-runs.json` lưu tối đa một số run gần nhất, ví dụ 20 run.

```ts
type UpdateRunStatus = 'queued' | 'running' | 'restarting' | 'verifying' | 'succeeded' | 'failed';

type UpdateRunStage =
  | 'checking'
  | 'preparing'
  | 'fetching'
  | 'checkout'
  | 'building'
  | 'restarting'
  | 'verifying'
  | 'succeeded'
  | 'failed';

type UpdateRunLog = {
  at: string;
  level: 'status' | 'log' | 'error';
  message: string;
};

type UpdateRun = {
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

## API design

- `GET /api/update/status`: giữ nguyên để kiểm tra release mới.
- `POST /api/update/run`: tạo update job mới hoặc trả job active nếu đang có job `running`, `restarting`, hoặc `verifying`.
- `GET /api/update/runs/latest`: trả run mới nhất để UI resume sau reload.
- `GET /api/update/runs/:runId`: trả trạng thái/log hiện tại của run.
- `GET /api/update/runs/:runId/stream`: stream log realtime cho run đó. Nếu stream đứt, UI vẫn polling endpoint run.

## Job flow

1. `checking`: lấy local version và GitHub latest release.
2. `preparing`: validate tag, ensure `.env`, resolve host project root.
3. `fetching`: chạy `git fetch --tags origin`.
4. `checkout`: chạy `git checkout -f <targetTag>` và ghi `version.json`.
5. `building`: updater container chạy `docker compose --project-directory <hostProjectRoot> -p quanlysvjx-manager build`.
6. `restarting`: updater container chạy `up -d api`, chờ API healthy/status đúng target, rồi `up -d ui`.
7. `verifying`: API mới xác nhận `currentVersion === targetTag`.
8. `succeeded` hoặc `failed`: ghi kết quả cuối vào JSON.

## Concurrency

Chỉ một update job được chạy tại một thời điểm. Nếu người dùng bấm cập nhật khi job đang `running`, `restarting`, hoặc `verifying`, API trả lại job active để UI nối log/status thay vì tạo job mới.

## Error handling

Không rollback tự động trong phase này. Khi lỗi xảy ra, job chuyển `failed`, ghi `failedStep`, `failedCommand`, `error`, log stdout/stderr cần thiết. UI hiển thị lỗi rõ ràng và nút “Thử lại”, tạo run mới nếu không còn job active.

## UI behavior

Panel cập nhật hệ thống hiển thị timeline stage, log, release notes snapshot và trạng thái cuối. Khi nhận stage `restarting`, UI không báo “mất kết nối”; thay vào đó hiển thị “Đang khởi động lại API/UI”. Sau reload, UI gọi `GET /api/update/runs/latest`; nếu run mới nhất `succeeded`, hiển thị thông báo thành công; nếu `failed`, hiển thị lỗi và log; nếu đang chạy, nối lại stream/polling.

## Testing

API cần test repository JSON read/write, concurrency active job, failure capture, route create/resume job. UI cần test start job, reconnect sau SSE disconnect, resume latest succeeded/failed/running, và retry failed run.

## Acceptance criteria

- Reload trang không làm mất trạng thái update.
- API/UI restart không làm UI báo lỗi giả.
- Mọi lỗi update có stage, command, message và log để debug.
- Bấm cập nhật nhiều lần không tạo job song song.
- Sau update thành công, UI hiện đúng version mới và thông báo thành công.
