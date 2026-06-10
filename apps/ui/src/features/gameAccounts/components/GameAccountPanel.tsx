import { Button, Group, Pagination, Stack, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/services/client';
import type { GameAccount } from '@/services/types';
import { GameAccountTable } from './GameAccountTable';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const pageSize = 10;

export function GameAccountPanel(_props: Props) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editingAccount, setEditingAccount] = useState<GameAccount | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<GameAccount | null>(null);
  const [createOpened, setCreateOpened] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ['game-accounts', search, page, pageSize],
    queryFn: () => api.gameAccounts({ search, page, pageSize })
  });

  const data = accountsQuery.data ?? { items: [], pagination: { page, pageSize, total: 0, totalPages: 1 } };

  return (
    <Stack>
      <Group align="end">
        <TextInput
          placeholder="Tìm theo tên tài khoản"
          label="Tìm kiếm"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1 }}
        />
        <Button onClick={() => setCreateOpened(true)}>Thêm tài khoản</Button>
      </Group>
      <GameAccountTable accounts={data.items} onEdit={setEditingAccount} onDelete={setDeletingAccount} />
      {data.pagination.total > pageSize && <Pagination total={data.pagination.totalPages} value={page} onChange={setPage} />}
      <span hidden>{createOpened ? 'create-open' : 'create-closed'}{editingAccount?.accountName}{deletingAccount?.accountName}</span>
    </Stack>
  );
}
