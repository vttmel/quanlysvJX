import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateRun } from '@/services/types';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { SelfUpdatePanel } from './SelfUpdatePanel';

const mocks = vi.hoisted(() => ({
  startRun: vi.fn(),
  streamRun: vi.fn(),
  checkNow: vi.fn(),
  getRun: vi.fn(),
  latestRun: null as UpdateRun | null,
  isStartingRun: false,
}));

const runningRun: UpdateRun = {
  runId: 'run-1',
  status: 'running',
  stage: 'building',
  currentVersion: 'v1.0.0',
  targetTag: 'v1.1.0',
  releaseUrl: 'url',
  releaseNotesSnapshot: 'Notes',
  startedAt: '2026-06-24T10:00:00.000Z',
  updatedAt: '2026-06-24T10:00:00.000Z',
  finishedAt: null,
  failedStep: null,
  failedCommand: null,
  error: null,
  logs: [{ at: '2026-06-24T10:00:00.000Z', level: 'status', message: 'building' }],
};

vi.mock('@/hooks/useUpdateStatus', () => ({
  useUpdateStatus: () => ({
    status: {
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      latestVersion: 'v1.1.0',
      latestTag: 'v1.1.0',
      releaseUrl: 'url',
      releaseNotes: 'Notes',
      hasUpdate: true,
      repoDirty: false,
      checkedAt: '2026-06-24T10:00:00.000Z',
    },
    isLoading: false,
    checkNow: mocks.checkNow,
    isChecking: false,
    latestRun: mocks.latestRun,
    isLoadingLatestRun: false,
    startRun: mocks.startRun,
    isStartingRun: mocks.isStartingRun,
    getRun: mocks.getRun,
    streamRun: mocks.streamRun,
  }),
}));

describe('SelfUpdatePanel', () => {
  beforeEach(() => {
    mocks.startRun.mockReset();
    mocks.streamRun.mockReset();
    mocks.checkNow.mockReset();
    mocks.getRun.mockReset();
    mocks.latestRun = null;
    mocks.isStartingRun = false;
    mocks.streamRun.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    cleanup();
  });

  it('shows update button when a newer release exists', () => {
    renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });
    expect(screen.getByText('v1.0.0')).toBeTruthy();
    expect(screen.getByText('v1.1.0')).toBeTruthy();
    expect((screen.getByRole('button', { name: /cập nhật/i }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('starts a durable update run and streams that run', async () => {
    mocks.startRun.mockResolvedValue(runningRun);
    mocks.getRun.mockResolvedValue(runningRun);

    renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });
    fireEvent.click(screen.getByRole('button', { name: /cập nhật/i }));

    await screen.findByText('Trạng thái: running');
    expect(mocks.startRun).toHaveBeenCalled();
    expect(mocks.streamRun).toHaveBeenCalledWith('run-1', expect.any(Object));
  });

  it('shows initializing loading message while start request is pending', () => {
    mocks.isStartingRun = true;

    renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });

    expect(screen.getByText('Đang khởi tạo cập nhật')).toBeTruthy();
    expect(screen.getByText(/Đang tạo job cập nhật từ GitHub/)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /đang cập nhật/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('shows active update stage while run is not completed', () => {
    mocks.latestRun = runningRun;

    renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });

    expect(screen.getByText('Đang cập nhật')).toBeTruthy();
    expect(screen.getByText(/Bước hiện tại:/)).toBeTruthy();
    expect(screen.getByText('building')).toBeTruthy();
  });

  it('shows failed latest run with retry option', () => {
    mocks.latestRun = {
      ...runningRun,
      runId: 'run-failed',
      status: 'failed',
      stage: 'failed',
      failedStep: 'building',
      failedCommand: 'docker compose build',
      error: 'build failed',
      finishedAt: '2026-06-24T10:01:00.000Z',
      logs: [{ at: '2026-06-24T10:01:00.000Z', level: 'error', message: 'build failed' }],
    };

    renderWithProviders(<SelfUpdatePanel onSuccess={vi.fn()} onError={vi.fn()} />, {
      route: '/settings',
    });

    expect(screen.getByText('Trạng thái: failed')).toBeTruthy();
    expect(screen.getAllByText(/build failed/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /thử lại/i })).toBeTruthy();
  });

  it('notifies success when latest run completed', async () => {
    const onSuccess = vi.fn();
    mocks.latestRun = {
      ...runningRun,
      status: 'succeeded',
      stage: 'succeeded',
      finishedAt: '2026-06-24T10:01:00.000Z',
    };

    renderWithProviders(<SelfUpdatePanel onSuccess={onSuccess} onError={vi.fn()} />, {
      route: '/settings',
    });

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith('Đã cập nhật JX Manager lên v1.1.0')
    );
    expect((screen.getByRole('button', { name: /cập nhật/i }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});
