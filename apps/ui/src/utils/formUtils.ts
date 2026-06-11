/**
 * Tự động focus vào trường nhập liệu bị lỗi đầu tiên trong form.
 * Được truyền làm callback thứ hai của form.onSubmit:
 * e.g., form.onSubmit(handleSubmit, focusFirstError)
 */
export function focusFirstError(errors: Record<string, any>) {
  const firstErrorKey = Object.keys(errors)[0];
  if (!firstErrorKey) {
    return;
  }

  // Xây dựng selector để tìm input tương ứng.
  // Mantine v7/v9 hỗ trợ name hoặc id hoặc data-path tương ứng với field key.
  const selector = `[name="${firstErrorKey}"], #${firstErrorKey}, [data-path="${firstErrorKey}"]`;
  const element = document.querySelector(selector);

  if (element instanceof HTMLElement) {
    element.focus();
  } else {
    // Phương án dự phòng: tìm bất kỳ input nào đang có trạng thái invalid
    const invalidElement = document.querySelector('[aria-invalid="true"]');
    if (invalidElement instanceof HTMLElement) {
      invalidElement.focus();
    }
  }
}
