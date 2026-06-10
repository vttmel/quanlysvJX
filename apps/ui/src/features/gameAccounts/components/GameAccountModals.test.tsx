import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/utils/test/renderWithProviders';
import { CreateGameAccountModal } from './CreateGameAccountModal';
import { EditGameAccountModal } from './EditGameAccountModal';
import { SoftDeleteAccountModal } from './SoftDeleteAccountModal';

describe('game account modals', () => {
  afterEach(() => cleanup());

  it('validates matching create passwords', async () => {
    const submit = vi.fn();
    renderWithProviders(<CreateGameAccountModal opened onClose={vi.fn()} onSubmit={submit} loading={false} />);

    fireEvent.change(screen.getByLabelText('Tên tài khoản'), { target: { value: 'jxuser' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'one' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: 'two' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu cấp 2'), { target: { value: 'pin' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu cấp 2'), { target: { value: 'pin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await screen.findByText('Mật khẩu xác nhận không khớp')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it('omits blank passwords when editing', async () => {
    const submit = vi.fn();
    renderWithProviders(<EditGameAccountModal opened account={{ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }} onClose={vi.fn()} onSubmit={submit} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({ expiresAt: '2027-06-10', leftSeconds: 0 }));
  });

  it('labels delete as banning the account', () => {
    renderWithProviders(<SoftDeleteAccountModal opened account={{ accountName: 'jxuser', expiresAt: '2027-06-10', leftSeconds: 0, usedSeconds: 0, status: 'active' }} onClose={vi.fn()} onConfirm={vi.fn()} loading={false} />);

    expect(screen.getAllByText(/ban tài khoản/i).length).toBeGreaterThan(0);
  });
});
