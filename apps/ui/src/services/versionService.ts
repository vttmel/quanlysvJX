import ApiService from './base/apiService';
import type { VersionListResponse, GameVersion } from './types';

export const versionService = {
  getVersions: async () => {
    const res = await ApiService.fetchData<any, VersionListResponse>({
      url: '/api/versions',
      method: 'GET',
    });
    return res.data;
  },
  selectVersion: async (payload: { name: string; subPath?: string }) => {
    const res = await ApiService.fetchData<any, { activeVersion: string; serverPath: string }>({
      url: '/api/versions/select',
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
  cloneVersion: async (payload: { name: string; url: string; branch?: string }) => {
    const res = await ApiService.fetchData<any, unknown>({
      url: '/api/versions/clone',
      method: 'POST',
      data: payload,
    });
    return res.data;
  },
  uploadVersion: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await ApiService.fetchData<FormData, unknown>({
      url: '/api/versions/upload',
      method: 'POST',
      data: form,
    });
    return res.data;
  },
  renameVersion: async (currentName: string, payload: { name?: string; displayName?: string }) => {
    const res = await ApiService.fetchData<any, GameVersion>({
      url: `/api/versions/${encodeURIComponent(currentName)}`,
      method: 'PATCH',
      data: payload,
    });
    return res.data;
  },
  deleteVersion: async (name: string) => {
    const res = await ApiService.fetchData<any, unknown>({
      url: `/api/versions/${encodeURIComponent(name)}`,
      method: 'DELETE',
    });
    return res.data;
  },
  browseVersion: async (name: string, path?: string) => {
    const query = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await ApiService.fetchData<any, { currentPath: string; parentPath: string | null; directories: string[] }>({
      url: `/api/versions/${encodeURIComponent(name)}/browse${query}`,
      method: 'GET',
    });
    return res.data;
  },
};
