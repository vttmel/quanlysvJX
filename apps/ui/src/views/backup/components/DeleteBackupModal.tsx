import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import { ModalTitle } from '@/components/common/ModalTitle';
import type { BackupFile } from '@/services/types';

type Props = {
  opened: boolean;
  file: BackupFile | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteBackupModal({ opened, file, loading, onClose, onConfirm }: Props) {
  const blocked = file?.isLatest === true;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<ModalTitle title="Xóa bản sao lưu" subtitle={file?.filename} />}
      centered
    >
      {blocked ? (
        <Alert color="red" mb="md">
          Không thể xóa bản sao lưu mới nhất
        </Alert>
      ) : null}
      <Text mb="md">Xóa file sao lưu {file ? <strong>{file.filename}</strong> : null}?</Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Hủy
        </Button>
        <Button color="red" disabled={!file || blocked} loading={loading} onClick={onConfirm}>
          Xóa
        </Button>
      </Group>
    </Modal>
  );
}
