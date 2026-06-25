# Thiết kế: Khắc phục lỗi giải nén khi tải lên phiên bản game lớn

Tài liệu này mô tả thiết kế chi tiết để khắc phục lỗi hệ thống bị treo hoặc báo lỗi giải nén thất bại khi người dùng tải lên (upload) các file game JX Server dạng nén dung lượng lớn.

## 1. Bối cảnh & Nguyên nhân lỗi

Khi tải lên một phiên bản game, API nhận file lưu trữ tạm thời tại `apps/jx-services/versions/` và tiến hành giải nén thông qua hàm `extractArchive` trong `VersionRepository`. 

Hàm này gọi lệnh hệ thống `unzip` (đối với file `.zip`) hoặc `tar` (đối với file `.tar.gz`) bằng cách sử dụng `spawnSync` từ Node.js với tùy chọn `stdio: 'pipe'`.

**Các vấn đề phát sinh:**
1. **Giới hạn bộ đệm `maxBuffer`:** Node.js mặc định đặt giới hạn `maxBuffer` cho `spawnSync` là `1024 * 1024` bytes (1MB).
2. **Log stdout quá lớn:** Lệnh `unzip` mặc định in ra chi tiết từng file được giải nén. Với file game JX Server chứa hàng vạn file script, map, cấu hình... lượng log in ra `stdout` vượt xa 1MB rất nhiều.
3. **Kết quả:** `spawnSync` bị lỗi tràn bộ đệm (`ENOBUFS`), tiến trình bị hủy đột ngột với exit status khác `0`. UI nhận phản hồi thất bại hoặc đứng im ở trạng thái "Đang giải nén...".

---

## 2. Giải pháp Đề xuất

### Thay đổi 1: Tối ưu hóa `runCommand` trong `VersionRepository`
* Thay đổi tùy chọn mặc định của `stdio` từ `'pipe'` thành `['ignore', 'ignore', 'pipe']` để bỏ qua `stdout` (do chúng ta không cần lấy danh sách file giải nén thành công, chỉ cần biết trạng thái kết thúc thành công hay không).
* Chỉ capture `stderr` để lấy thông báo lỗi chi tiết khi lệnh thất bại.
* Tăng `maxBuffer` mặc định lên `50MB` (`50 * 1024 * 1024` bytes) nhằm đảm bảo lưu trữ trọn vẹn log lỗi của `stderr` trong trường hợp có lỗi lớn xảy ra.
* Hỗ trợ truyền đè các tham số `options` trong trường hợp các tác vụ khác cần đọc `stdout`.

### Thay đổi 2: Tối ưu hóa tham số giải nén `unzip` trong `extractArchive`
* Thêm flag `-q` (quiet) cho lệnh `unzip`. Lệnh đầy đủ sẽ là: `unzip -q -o <tempArchivePath> -d <targetDir>`.
* Việc thêm `-q` giúp `unzip` chạy ở chế độ im lặng, không in log giải nén ra `stdout`, giúp giảm tải I/O và tăng tốc độ giải nén đáng kể trên hệ thống.

---

## 3. Các File Thay đổi Dự kiến

### [Component: Backend API]

#### [MODIFY] [versionRepository.ts](file:///home/hungnt/dev/quanlysvJX/apps/api/src/repositories/versionRepository.ts)
* Cập nhật hàm `runCommand` để bổ sung tham số `options` cấu hình cho `spawnSync`, với mặc định an toàn:
  ```typescript
  runCommand(command: string, args: string[], options: { stdio?: any; maxBuffer?: number } = {}) {
    const result = spawnSync(command, args, {
      stdio: options.stdio || ['ignore', 'ignore', 'pipe'],
      maxBuffer: options.maxBuffer || 50 * 1024 * 1024,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      throw new Error((result.stderr || `${command} failed`).trim());
    }
  }
  ```
* Cập nhật hàm `extractArchive` sử dụng flag `-q` cho `unzip`:
  ```typescript
  extractArchive(tempArchivePath: string, filename: string, targetDir: string) {
    const ext = path.extname(filename).toLowerCase();
    const isZip = ext === '.zip';
    const isTarGz = filename.endsWith('.tar.gz') || ext === '.tgz';

    if (isZip) {
      this.runCommand('unzip', ['-q', '-o', tempArchivePath, '-d', targetDir]);
      return;
    }
    if (isTarGz) {
      this.runCommand('tar', ['-xzf', tempArchivePath, '-C', targetDir]);
      return;
    }

    throw new Error('Unsupported archive format. Only zip, tar.gz, and tgz are supported.');
  }
  ```

#### [NEW] [versionRepository.test.ts](file:///home/hungnt/dev/quanlysvJX/apps/api/src/repositories/versionRepository.test.ts)
* Tạo mới file test cho `VersionRepository` để kiểm tra chức năng giải nén `extractArchive` và xử lý lỗi của `runCommand`.
* Test cases bao gồm:
  * Giải nén file ZIP giả lập thành công (không bị lỗi buffer).
  * Giải nén file TAR.GZ giả lập thành công.
  * Báo lỗi chính xác khi file không đúng định dạng hỗ trợ.

---

## 4. Kế hoạch Xác minh (Verification Plan)

### Kiểm thử tự động (Automated Tests)
* Chạy bộ kiểm thử mới cho `VersionRepository`:
  ```bash
  npx vitest run apps/api/src/repositories/versionRepository.test.ts
  ```
* Chạy lại toàn bộ unit test của toàn bộ dự án để đảm bảo không gây ảnh hưởng phụ (regression):
  ```bash
  npm run test
  ```

### Kiểm thử thực tế (Manual Verification)
1. Tải lên một file game `.zip` thực tế (dung lượng từ vài trăm MB trở lên) qua giao diện web.
2. Kiểm tra tiến trình tải lên: sau khi đạt 100%, hệ thống chuyển sang "Đang giải nén..." và giải nén thành công, hiển thị phiên bản mới trong danh sách phiên bản sẵn sàng.
3. Kiểm tra log của backend xem có bất kỳ lỗi `ENOBUFS` nào xuất hiện hay không.
