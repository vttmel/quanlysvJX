import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionManager } from './VersionManager';
import { api } from '@/services/client';
import { renderWithProviders } from '@/utils/test/renderWithProviders';

vi.mock('@/services/client', () => ({
  api: {
    versions: vi.fn().mockResolvedValue({
      activeVersion: 'mel',
      versions: [
        {
          name: 'mel',
          displayName: 'MEL',
          rootPath: 'apps/jx-services/versions/mel',
          serverPath: 'apps/jx-services/versions/mel/server',
          path: './apps/jx-services/versions/mel/server/',
          enabled: true,
          uploadedAt: '2026-06-10T14:30:00.000Z',
          isActive: true
        }
      ]
    }),
    selectVersion: vi.fn(),
    cloneVersion: vi.fn(),
    uploadVersionWithProgress: vi.fn(),
    renameVersion: vi.fn(),
    deleteVersion: vi.fn(),
    browseVersion: vi.fn()
  }
}));

describe('VersionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows uploaded time from version metadata', async () => {
    renderWithProviders(<VersionManager onSuccess={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByText('MEL')).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
  });

  it('blocks upload when the version name already exists', async () => {
    renderWithProviders(<VersionManager onSuccess={vi.fn()} onError={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tải lên file game' }));
    fireEvent.change(await screen.findByLabelText(/Tên phiên bản/), { target: { value: 'mel' } });

    expect(await screen.findByText('Tên phiên bản đã tồn tại')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(api.uploadVersionWithProgress).not.toHaveBeenCalled());
  });
});
