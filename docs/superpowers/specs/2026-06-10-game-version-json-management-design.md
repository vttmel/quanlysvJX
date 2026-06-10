# Game Version JSON Management Design

## Goal

Quản lý các phiên bản game bằng một file JSON trung tâm để web manager có thể tải lên, đổi tên, chọn bản đang chạy và đồng bộ đường dẫn dịch vụ Docker một cách nhất quán.

## Registry

File registry nằm tại `apps/jx-services/versions/versions.json` và là nguồn dữ liệu chính cho màn hình phiên bản.

```json
{
  "activeVersion": "mel",
  "versions": [
    {
      "name": "mel",
      "displayName": "MEL",
      "rootPath": "apps/jx-services/versions/mel",
      "serverPath": "apps/jx-services/versions/mel/server",
      "enabled": true,
      "uploadedAt": "2026-06-10T14:30:00.000Z"
    }
  ]
}
```

Nếu registry chưa tồn tại, backend tự khởi tạo từ các thư mục hiện có trong `apps/jx-services/versions`. Trường `uploadedAt` của thư mục cũ lấy từ thời gian sửa đổi của thư mục.

## Behavior

- `GET /api/versions` đọc registry JSON và trả về danh sách phiên bản, bản active, đường dẫn chạy và thời gian tải lên.
- Upload bắt buộc nhập tên phiên bản trước khi chọn file và bấm upload. Không cho tên trùng registry hoặc thư mục hiện có.
- Upload hiển thị phần trăm tiến độ gửi file. Sau khi đạt 100%, UI chuyển sang trạng thái đang giải nén cho đến khi backend hoàn tất.
- Chọn phiên bản cập nhật `activeVersion` trong registry và đồng bộ `SERVER_PATH` trong `.env` để các service dùng đúng thư mục.
- Đổi tên phiên bản kiểm tra trùng tên, rename thư mục, cập nhật registry và đồng bộ `.env` nếu phiên bản đang active.
- Xóa phiên bản không cho xóa bản đang active.
- Mọi đường dẫn chọn làm `serverPath` phải nằm trong thư mục root của phiên bản.

## UI

Màn hình `VersionManager` hiển thị tên, tên hiển thị, đường dẫn chạy, trạng thái, thời gian tải lên và các thao tác: sử dụng, đổi tên, duyệt thư mục, xóa. Upload dùng modal riêng với tên phiên bản, chọn file, nút upload và thanh tiến độ.

## Testing

Backend cần test registry bootstrap, chống trùng tên, upload có tên, rename active version và đồng bộ `.env`. UI cần test upload modal gửi `name` + `file`, chặn tên trùng và hiển thị progress.
