import { Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { ModalTitle } from '@/components/common/ModalTitle';
import { formatDatabaseLabel } from '../utils/backupDisplay';

type Props = {
  opened: boolean;
  kind: 'mysql' | 'mssql';
  filename: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RestoreModal({ opened, kind, filename, loading, onClose, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('');
  const matches = filename !== null && confirmText === filename;

  useEffect(() => {
    if (!opened) {
      setConfirmText('');
    }
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<ModalTitle title={`Khôi phục ${formatDatabaseLabel(kind)}`} subtitle={filename} />}
      centered
    >
      <Text mb="sm">Thao tác này sẽ ghi đè dữ liệu hiện tại. Nhập đúng tên file để xác nhận.</Text>
      <Text fw={700} mb="sm">
        {filename}
      </Text>
      <TextInput
        value={confirmText}
        onChange={(event) => setConfirmText(event.currentTarget.value)}
        placeholder="Tên file sao lưu"
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Hủy
        </Button>
        <Button color="red" disabled={!matches} loading={loading} onClick={onConfirm}>
          Khôi phục
        </Button>
      </Group>
    </Modal>
  );
}
