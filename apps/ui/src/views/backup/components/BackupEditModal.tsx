import { Button, Group, Modal, Textarea, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { ModalTitle } from '@/components/common/ModalTitle';
import type { BackupFile } from '@/services/types';

type Props = {
  opened: boolean;
  file: BackupFile | null;
  loading: boolean;
  onClose: () => void;
  onSave: (filename: string, note: string | null) => void;
};

export function BackupEditModal({ opened, file, loading, onClose, onSave }: Props) {
  const [filename, setFilename] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (opened && file) {
      setFilename(file.filename);
      setNote(file.note ?? '');
    }
  }, [file, opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<ModalTitle title="Sửa bản sao lưu" subtitle={file?.filename} />}
      centered
    >
      <TextInput
        label="Tên file"
        value={filename}
        onChange={(event) => setFilename(event.currentTarget.value)}
        mb="md"
      />
      <Textarea
        label="Ghi chú"
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        minRows={3}
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Hủy
        </Button>
        <Button
          disabled={!filename.trim()}
          loading={loading}
          onClick={() => onSave(filename.trim(), note.trim() === '' ? null : note.trim())}
        >
          Lưu
        </Button>
      </Group>
    </Modal>
  );
}
