---
trigger: always_on
---

# Data Integrity & Validation Standards

Quy chuẩn kiểm tra tính toàn vẹn của dữ liệu ở cả hai phía Frontend và Backend để đảm bảo an toàn hệ thống.

### 1. Kiểm tra phía Frontend (Frontend Validation)

- **Công cụ định nghĩa Schema**: Sử dụng `Zod` để xây dựng schema xác thực dữ liệu.
- **Tích hợp Form**: Sử dụng `@mantine/form` tích hợp Zod resolver để quản lý trạng thái form.
- **Trải nghiệm người dùng (UX)**:
  - Hiển thị thông báo lỗi trực quan ngay dưới hoặc bên cạnh ô nhập liệu bị sai.
  - Khi gửi form thất bại, tiêu điểm (focus) phải tự động di chuyển về ô nhập liệu bị lỗi đầu tiên.
