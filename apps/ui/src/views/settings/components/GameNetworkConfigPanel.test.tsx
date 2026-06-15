import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { GameNetworkConfigPanel } from './GameNetworkConfigPanel';

const mockSaveGameNetwork = vi.fn();

vi.mock('@/services/systemService', () => ({
  systemService: {
    getSystemInfo: vi.fn().mockResolvedValue({
      serverTime: '2026-06-11T08:00:00.000Z',
      timezone: 'Asia/Ho_Chi_Minh',
      ipChoices: ['192.168.1.20'],
      serverIpChoices: [{ address: '192.168.1.20', interfaceName: 'eth0', kind: 'host' }],
      serverIp: '192.168.1.20',
      mysqlIp: '127.0.0.1',
      mssqlIp: '192.168.1.20',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '10.0.0.8',
        paysysIp: '172.18.0.1',
        mssqlIp: '192.168.1.20',
      },
      coreServicesRunning: true,
      runningCoreServices: ['jxserver'],
    }),
    saveGameNetwork: (...args: unknown[]) => mockSaveGameNetwork(...args),
  },
}));

describe('GameNetworkConfigPanel', () => {
  beforeEach(() => {
    mockSaveGameNetwork.mockResolvedValue({
      message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.',
      gameNetwork: {
        jxIp: '192.168.1.20',
        mysqlIp: '10.0.0.9',
        paysysIp: '172.18.0.2',
        mssqlIp: '8.8.8.8',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the saved game network config and allows free IPv4 input for all fields', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    expect(await screen.findByText('Cấu hình IP game')).toBeTruthy();
    expect(await screen.findByText(/jxserver/)).toBeTruthy();
    expect(screen.queryByText('auto')).toBeNull();
    expect((screen.getAllByLabelText('Game server IP')[0] as HTMLInputElement).value).toBe(
      '192.168.1.20'
    );
    expect(screen.queryByText('127.0.0.1')).toBeNull();

    fireEvent.change(screen.getByLabelText('MySQL IP'), { target: { value: '10.0.0.9' } });
    fireEvent.change(screen.getByLabelText('Paysys IP'), { target: { value: '172.18.0.2' } });
    fireEvent.change(screen.getByLabelText('MSSQL IP'), { target: { value: '8.8.8.8' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    await waitFor(() => {
      expect(mockSaveGameNetwork.mock.calls[0]?.[0]).toEqual({
        jxIp: '192.168.1.20',
        mysqlIp: '10.0.0.9',
        paysysIp: '172.18.0.2',
        mssqlIp: '8.8.8.8',
      });
      expect(onSuccess).toHaveBeenCalledWith(
        'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
      );
    });
  });

  it('allows typing a LAN IP for Game server IP that is not in the suggestion list', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    await screen.findByText(/jxserver/);

    fireEvent.change(screen.getAllByLabelText('Game server IP')[0], {
      target: { value: '192.168.1.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    await waitFor(() => {
      expect(mockSaveGameNetwork.mock.calls[0]?.[0]).toMatchObject({ jxIp: '192.168.1.50' });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('shows client IPv4 validation errors below the invalid textbox', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    await screen.findByText(/jxserver/);
    fireEvent.change(screen.getByLabelText('MySQL IP'), { target: { value: '999.1.1.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    expect(await screen.findByText('Vui lòng nhập đúng IPv4.')).toBeTruthy();
    expect(mockSaveGameNetwork).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('maps server IPv4 validation errors back to the IP textboxes', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    mockSaveGameNetwork.mockRejectedValueOnce(
      new Error('IP không hợp lệ. Vui lòng nhập đúng IPv4.')
    );

    renderWithProviders(<GameNetworkConfigPanel onSuccess={onSuccess} onError={onError} />, {
      route: '/settings/versions',
    });

    await screen.findByText(/jxserver/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình IP' }));

    await waitFor(() => {
      expect(screen.getAllByText('Vui lòng nhập đúng IPv4.')).toHaveLength(4);
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
