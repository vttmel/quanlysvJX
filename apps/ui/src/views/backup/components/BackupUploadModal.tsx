import {
  Alert,
  Button,
  FileInput,
  Group,
  Modal,
  Progress,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { ModalTitle } from '@/components/common/ModalTitle';
import type { BackupKind, UploadBackupPayload } from '@/services/types';

type Props = {
  opened: boolean;
  loading: boolean;
  onClose: () => void;
  onUpload: (payload: UploadBackupPayload) => void;
};

const maxUploadSize = 2 * 1024 * 1024 * 1024;

const backupRules: Record<BackupKind, { accept: string; hint: string }> = {
  mysql: { accept: '.sql,.sql.gz', hint: 'Chỉ chọn file .sql hoặc .sql.gz' },
  mssql: { accept: '.bak', hint: 'Chỉ chọn file .bak' },
};

export function BackupUploadModal({ opened, loading, onClose, onUpload }: Props) {
  const [kind, setKind] = useState<BackupKind>('mysql');
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!opened) {
      setKind('mysql');
      setFile(null);
      setFilename('');
      setNote('');
    }
  }, [opened]);

  const filenameError = getFilenameError(kind, filename);
  const fileError = getFileError(kind, file);
  const canSubmit = Boolean(file) && !filenameError && !fileError && !loading;

  const handleKindChange = (value: string | null) => {
    const nextKind = (value ?? 'mysql') as BackupKind;
    setKind(nextKind);
    if (file && getFileError(nextKind, file)) {
      setFile(null);
      setFilename('');
    }
  };

  const handleFileChange = (nextFile: File | null) => {
    setFile(nextFile);
    setFilename(nextFile?.name ?? '');
  };

  const handleUpload = () => {
    if (!file || !canSubmit) {
      return;
    }

    onUpload({
      kind,
      file,
      filename: filename.trim(),
      note: note.trim() ? note.trim() : null,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={loading ? () => undefined : onClose}
      title={<ModalTitle title="Tải file backup lên" subtitle="Đưa file vào kho sao lưu" />}
      centered
    >
      <Stack gap="md">
        <Alert color="blue" variant="light">
          Upload chỉ thêm file vào danh sách backup, chưa khôi phục dữ liệu vào database.
        </Alert>
        <Select
          label="Database"
          data={[
            { value: 'mysql', label: 'MySQL' },
            { value: 'mssql', label: 'MSSQL' },
          ]}
          value={kind}
          onChange={handleKindChange}
          disabled={loading}
        />
        <FileInput
          accept={backupRules[kind].accept}
          clearable
          description={`${backupRules[kind].hint}. Dung lượng tối đa: 2GB.`}
          error={fileError}
          label="File backup"
          value={file}
          onChange={handleFileChange}
          placeholder="Chọn file backup"
          disabled={loading}
        />
        <TextInput
          description="Có thể đổi tên trước khi lưu. Hệ thống không tự sửa đuôi file."
          error={filenameError}
          label="Tên lưu trên server"
          value={filename}
          onChange={(event) => setFilename(event.currentTarget.value)}
          disabled={loading || !file}
        />
        <Textarea
          autosize
          minRows={2}
          maxRows={4}
          label="Ghi chú"
          placeholder="Ví dụ: Data trước khi update version"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          disabled={loading}
        />
        {file ? (
          <Text size="sm" c="dimmed">
            Đã chọn: {file.name} · {formatBytes(file.size)}
          </Text>
        ) : null}
        {loading ? <Progress animated value={100} /> : null}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button disabled={!canSubmit} loading={loading} onClick={handleUpload}>
            Tải lên
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function getFilenameError(kind: BackupKind, filename: string) {
  const value = filename.trim();
  if (!value) {
    return 'Tên lưu trên server là bắt buộc';
  }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    return 'Tên file chỉ được chứa chữ, số, dấu chấm, gạch dưới và gạch ngang';
  }
  if (kind === 'mysql' && !isMysqlBackup(value)) {
    return 'File MySQL phải có đuôi .sql hoặc .sql.gz';
  }
  if (kind === 'mssql' && !value.endsWith('.bak')) {
    return 'File MSSQL phải có đuôi .bak';
  }
  return null;
}

function getFileError(kind: BackupKind, file: File | null) {
  if (!file) {
    return null;
  }
  if (file.size > maxUploadSize) {
    return 'File vượt quá giới hạn 2GB';
  }
  if (kind === 'mysql' && !isMysqlBackup(file.name)) {
    return 'File MySQL phải có đuôi .sql hoặc .sql.gz';
  }
  if (kind === 'mssql' && !file.name.endsWith('.bak')) {
    return 'File MSSQL phải có đuôi .bak';
  }
  return null;
}

function isMysqlBackup(filename: string) {
  return filename.endsWith('.sql') || filename.endsWith('.sql.gz');
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
