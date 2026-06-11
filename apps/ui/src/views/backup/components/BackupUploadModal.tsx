import { Button, FileInput, Group, Modal, Select } from '@mantine/core';
import { useEffect, useState } from 'react';
import { ModalTitle } from '@/components/common/ModalTitle';
import type { BackupKind } from '@/services/types';

type Props = {
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onUpload: (kind: BackupKind, file: File) => void;
};

export function BackupUploadModal({ opened, loading, onClose, onUpload }: Props) {
  const [kind, setKind] = useState<BackupKind>('mysql');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!opened) {
      setKind('mysql');
      setFile(null);
    }
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<ModalTitle title="Tải lên bản sao lưu" subtitle="MySQL hoặc MSSQL" />}
      centered
    >
      <Select
        label="Database"
        data={[
          { value: 'mysql', label: 'MySQL' },
          { value: 'mssql', label: 'MSSQL' },
        ]}
        value={kind}
        onChange={(value) => setKind((value ?? 'mysql') as BackupKind)}
        mb="md"
      />
      <FileInput
        label="File sao lưu"
        value={file}
        onChange={setFile}
        placeholder="Chọn file sao lưu"
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Hủy
        </Button>
        <Button disabled={!file} loading={loading} onClick={() => file && onUpload(kind, file)}>
          Tải lên
        </Button>
      </Group>
    </Modal>
  );
}
