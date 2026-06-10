import type {
  ApiEnvelope,
  BackupFile,
  BackupJob,
  BackupKind,
  BackupList,
  BackupScheduleConfig,
  BackupSettings,
  CreateGameAccountPayload,
  DatabaseBackupSchedule,
  GameAccount,
  GameAccountListResponse,
  GameVersion,
  ServiceStatus,
  UpdateGameAccountPayload,
  VersionListResponse
} from '@/services/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const headers = init?.body === undefined || isFormData ? init?.headers : { 'Content-Type': 'application/json', ...init.headers };
  const response = await fetch(url, { ...init, headers });
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!body.success) {
    throw new Error(body.error);
  }

  return body.data;
}

export const api = {
  services: () => request<ServiceStatus[]>('/api/services'),
  action: (service: string, action: 'start' | 'stop' | 'restart') =>
    request<{ message: string }>(`/api/services/${service}/${action}`, { method: 'POST' }),
  logs: (service: string, tail: number) =>
    request<{ service: string; tail: number; logs: string }>(`/api/services/${service}/logs?tail=${tail}`),
  logStreamUrl: (service: string, tail: number) => `/api/services/${service}/logs/stream?tail=${tail}`,
  backups: () => request<BackupList>('/api/backups'),
  backup: (kind: BackupKind | 'all') => request<unknown>(`/api/backups/${kind}`, { method: 'POST' }),
  uploadBackup: (kind: BackupKind, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<BackupFile>(`/api/backups/${kind}/upload`, { method: 'POST', body: form });
  },
  updateBackup: (kind: BackupKind, currentFilename: string, payload: { filename: string; note: string | null }) =>
    request<BackupFile>(`/api/backups/${kind}/${encodeURIComponent(currentFilename)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteBackup: (kind: BackupKind, filename: string) =>
    request<{ filename: string }>(`/api/backups/${kind}/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  restore: (kind: BackupKind, filename: string) =>
    request<unknown>(`/api/restores/${kind}`, { method: 'POST', body: JSON.stringify({ filename }) }),
  jobs: () => request<BackupJob[]>('/api/jobs'),
  schedules: () => request<BackupScheduleConfig>('/api/backup-schedules'),
  saveSchedule: (kind: BackupKind, schedule: DatabaseBackupSchedule) =>
    request<BackupScheduleConfig>(`/api/backup-schedules/${kind}`, { method: 'PUT', body: JSON.stringify(schedule) }),
  backupSettings: () => request<BackupSettings>('/api/backup-settings'),
  gameAccounts: (params: { search: string; page: number; pageSize: number }) => {
    const query = new URLSearchParams({ search: params.search, page: String(params.page), pageSize: String(params.pageSize) });
    return request<GameAccountListResponse>(`/api/game-accounts?${query.toString()}`);
  },
  createGameAccount: (payload: CreateGameAccountPayload) =>
    request<GameAccount>('/api/game-accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateGameAccount: (accountName: string, payload: UpdateGameAccountPayload) =>
    request<GameAccount>(`/api/game-accounts/${encodeURIComponent(accountName)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGameAccount: (accountName: string) =>
    request<{ message: string }>(`/api/game-accounts/${encodeURIComponent(accountName)}`, { method: 'DELETE' }),
  banGameAccount: (accountName: string) =>
    request<GameAccount>(`/api/game-accounts/${encodeURIComponent(accountName)}/ban`, { method: 'POST' }),
  unbanGameAccount: (accountName: string) =>
    request<GameAccount>(`/api/game-accounts/${encodeURIComponent(accountName)}/unban`, { method: 'POST' }),
  env: () => request<{ content: string }>('/api/env'),
  saveEnv: (content: string) =>
    request<{ message: string }>('/api/env', { method: 'POST', body: JSON.stringify({ content }) }),
  versions: () => request<VersionListResponse>('/api/versions'),
  selectVersion: (payload: { name: string; subPath?: string }) =>
    request<{ activeVersion: string; serverPath: string }>('/api/versions/select', { method: 'POST', body: JSON.stringify(payload) }),
  cloneVersion: (payload: { name: string; url: string; branch?: string }) =>
    request<unknown>('/api/versions/clone', { method: 'POST', body: JSON.stringify(payload) }),
  uploadVersion: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<unknown>('/api/versions/upload', { method: 'POST', body: form });
  },
  uploadVersionWithProgress: (payload: { name: string; displayName?: string; file: File; onProgress: (progress: number) => void }) =>
    uploadWithProgress('/api/versions/upload', payload),
  renameVersion: (currentName: string, payload: { name?: string; displayName?: string }) =>
    request<GameVersion>(`/api/versions/${encodeURIComponent(currentName)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteVersion: (name: string) =>
    request<unknown>(`/api/versions/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  browseVersion: (name: string, path?: string) => {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    return request<{ currentPath: string; parentPath: string | null; directories: string[] }>(`/api/versions/${encodeURIComponent(name)}/browse${query}`);
  }
};

function uploadWithProgress(
  url: string,
  payload: { name: string; displayName?: string; file: File; onProgress: (progress: number) => void }
): Promise<GameVersion> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('name', payload.name);
    if (payload.displayName) {
      form.append('displayName', payload.displayName);
    }
    form.append('file', payload.file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        payload.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}') as ApiEnvelope<GameVersion>;
        if (xhr.status >= 200 && xhr.status < 300 && body.success) {
          resolve(body.data);
          return;
        }
        reject(new Error(body.success === false ? body.error : `Upload failed with status ${xhr.status}`));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });
}
