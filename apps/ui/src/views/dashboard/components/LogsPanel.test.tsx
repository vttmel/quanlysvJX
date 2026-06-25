import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceService } from '@/services/serviceService';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { LogsPanel } from './LogsPanel';

vi.mock('@/services/serviceService', () => ({
  serviceService: {
    getLogs: vi.fn().mockResolvedValue({ service: 'all', tail: 300, logs: '' }),
    logStreamUrl: vi.fn(() => '/api/services/all/logs/stream?tail=0'),
  },
}));

class MockEventSource {
  close = vi.fn();
  constructor(public readonly url: string) {}
  addEventListener() {
    return undefined;
  }
}

describe('LogsPanel', () => {
  const mockedGetLogs = vi.mocked(serviceService.getLogs);

  beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
    mockedGetLogs.mockResolvedValue({ service: 'all', tail: 300, logs: '' });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('uses operator-friendly log wording and a taller log viewport', async () => {
    renderWithProviders(
      <LogsPanel services={[]} selected={null} onSelect={vi.fn()} onError={vi.fn()} />
    );

    expect(await screen.findByText('Nhật ký dịch vụ')).toBeTruthy();
    expect(screen.queryByText('Docker logs')).toBeNull();
    expect(screen.getByRole('button', { name: 'Xóa nhật ký hiển thị' })).toBeTruthy();
    const viewport = screen.getByTestId('service-log-viewport');
    expect(viewport.style.height).toBe('55vh');
    expect(viewport.style.maxHeight).toBe('560px');
    expect(viewport.style.minHeight).toBe('320px');
  });

  it('renders terminal backspace characters without visible glyphs', async () => {
    mockedGetLogs.mockResolvedValueOnce({
      service: 'all',
      tail: 300,
      logs: 'jxserver | abc\b\b12\n',
    });

    renderWithProviders(
      <LogsPanel services={[]} selected={null} onSelect={vi.fn()} onError={vi.fn()} />
    );

    expect(await screen.findByText('a12')).toBeTruthy();
    expect(screen.getByTestId('service-log-viewport').textContent).not.toContain('\b');
  });

  it('collapses jxserver progress counters that rewrite six digits', async () => {
    const rewriteCounter = `${'\b'.repeat(6)}000003${'\b'.repeat(6)}000004${'\b'.repeat(6)}000005`;
    mockedGetLogs.mockResolvedValueOnce({
      service: 'all',
      tail: 300,
      logs: `jxserver | ${rewriteCounter}In TestSuite[MyTestSuite]:\r\n`,
    });

    renderWithProviders(
      <LogsPanel services={[]} selected={null} onSelect={vi.fn()} onError={vi.fn()} />
    );

    expect(await screen.findByText('000005In TestSuite[MyTestSuite]:')).toBeTruthy();
    expect(screen.getByTestId('service-log-viewport').textContent).not.toContain('\b');
  });
});
