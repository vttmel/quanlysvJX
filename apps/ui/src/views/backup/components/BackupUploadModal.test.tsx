import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { BackupUploadModal } from './BackupUploadModal';

describe('BackupUploadModal', () => {
  afterEach(() => cleanup());

  it('filters MySQL backup files and submits the server filename and note', async () => {
    const onUpload = vi.fn();
    renderWithProviders(
      <BackupUploadModal opened loading={false} onClose={vi.fn()} onUpload={onUpload} />
    );
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) {
      throw new Error('Expected file input');
    }
    const file = new File(['backup'], 'server1.sql.gz', { type: 'application/gzip' });

    expect(fileInput.getAttribute('accept')).toBe('.sql,.sql.gz');
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByDisplayValue('server1.sql.gz');

    fireEvent.change(screen.getByLabelText('Tên lưu trên server'), {
      target: { value: 'server1-before-update.sql.gz' },
    });
    fireEvent.change(screen.getByLabelText('Ghi chú'), {
      target: { value: 'Trước khi update version' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên' }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload).toHaveBeenCalledWith({
      kind: 'mysql',
      file,
      filename: 'server1-before-update.sql.gz',
      note: 'Trước khi update version',
    });
  });

  it('blocks files larger than 2GB before upload', async () => {
    const onUpload = vi.fn();
    renderWithProviders(
      <BackupUploadModal opened loading={false} onClose={vi.fn()} onUpload={onUpload} />
    );
    const fileInput = document.querySelector('input[type="file"]');
    if (!fileInput) {
      throw new Error('Expected file input');
    }
    const file = new File(['backup'], 'huge.sql.gz');
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 * 1024 + 1 });

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText('File vượt quá giới hạn 2GB')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải lên' }).hasAttribute('disabled')).toBe(true);
  });
});
