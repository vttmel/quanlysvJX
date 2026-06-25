# Changelog

Tất cả những thay đổi quan trọng đối với dự án JX Manager sẽ được ghi nhận tại đây.

## [1.0.2] - 2026-06-25

### Thêm mới (Added)
- **Tích hợp công cụ tự động phát hành**: Bổ sung skill `/release-skills` để hỗ trợ quy trình phát hành phiên bản tự động của AI Agent.

### Cải tiến & Tối ưu hóa (Improvements & Refactor)
- **Dọn dẹp tài liệu**: Loại bỏ các kế hoạch kiến trúc (plans) và tài liệu thiết kế (specs) cũ không còn sử dụng để làm sạch mã nguồn.

### Sửa lỗi (Fixed)
- **Khắc phục lỗi tải lên phiên bản game lớn**: Tối ưu hóa lệnh giải nén trong `VersionRepository` bằng cách tắt log stdout (`unzip -q`) và tăng bộ đệm `maxBuffer` lên 50MB để tránh lỗi tràn bộ đệm hệ thống (`ENOBUFS`) khi giải nén các file zip/tar lớn.

## [1.0.1] - 2026-06-25

### Thêm mới (Added)

- **Real-time System Resource Monitoring**: Tích hợp hiển thị các thông số hiệu năng máy chủ thời gian thực trực tiếp trên Header Dashboard bao gồm:
  - Tỉ lệ sử dụng % CPU (tính toán chênh lệch ticks động).
  - Tỉ lệ % và dung lượng thực tế sử dụng của RAM (`ramUsed/ramTotal GB (ramUsage%)`).
  - Tỉ lệ % và dung lượng thực tế sử dụng của Disk (`diskUsed/diskTotal GB (diskUsage%)`).
  - Thời gian Server (Server Clock) tự động cập nhật và đồng bộ từng giây thông qua component `ServerClockBadge` tối ưu hiệu năng tránh re-render layout chính.
- **Tích hợp Dịch vụ Quản lý File**:
  - Tích hợp dịch vụ quản lý file chuyên nghiệp hỗ trợ giao diện đầy đủ thông qua **code-server** chạy bằng Docker.
  - Cho phép người dùng thao tác trực tiếp với các tệp tin cấu hình game trên giao diện Web UI thông qua `FileManagerView` với chế độ tràn màn hình (full-height viewport).
- **Cấu hình Phiên bản Game động**:
  - Hỗ trợ quản lý và kích hoạt phiên bản game động (symlink) trong thư mục dịch vụ JX.

### Cải tiến & Tối ưu hóa (Improvements & Refactor)

- **Responsive Header Badges**:
  - Cải tiến Header tự động co giãn thông minh không bị xô lệch hay chồng chéo chữ trên mọi breakpoint (Desktop, Tablet, Mobile).
  - Tự động rút gọn định dạng giờ Server thành `HH:mm:ss` khi màn hình `< 1200px` (tiết kiệm ~100px chiều ngang).
  - Tự động ẩn các nhãn chữ hiển thị của Badge (RAM, Disk, CPU, IP server, Time server) và chỉ giữ lại Icon + giá trị số khi màn hình co nhỏ (`< 1200px`).
  - Tự động rút gọn hiển thị RAM và Disk (chỉ hiển thị phần trăm %) ở màn hình nhỏ.
  - Chuyển IP MySQL và IP MSSQL thành `visibleFrom="lg"` để tự động ẩn khi chiều rộng màn hình `< 1200px` nhằm ưu tiên không gian cho các thông số quan trọng.
  - Thiết lập thuộc tính chống bóp méo `flex-shrink: 0` trên các Badge và bổ sung thanh cuộn ngang ẩn (`overflow-x: auto`) cho nhóm Badge phòng ngừa trường hợp cực đoan.
- **Di chuyển JX Manager Branding sang Navbar**:
  - Chuyển logo "JX Manager", thông tin phiên bản hiện hành, nút kiểm tra cập nhật và nút nâng cấp phiên bản sang Sidebar bên trái (Navbar) để giải phóng diện tích cho Header.

### Sửa lỗi (Fixed)

- Sửa lỗi xô lệch, méo mó và rớt chữ của các Badge thông số khi thu nhỏ màn hình trình duyệt.
- Cập nhật và điều chỉnh toàn bộ các mock unit test suite của UI để tương thích với các thông số hiệu năng và định dạng đồng hồ mới.
