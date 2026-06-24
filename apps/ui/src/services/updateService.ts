import ApiService from './base/apiService';
import type { UpdateEvent, UpdateRun, UpdateStatus } from './types';

export const updateService = {
  getStatus: async () => {
    const res = await ApiService.fetchData<any, UpdateStatus>({
      url: '/api/update/status',
      method: 'GET',
    });
    return res.data;
  },
  checkNow: async () => {
    const res = await ApiService.fetchData<any, UpdateStatus>({
      url: '/api/update/check',
      method: 'POST',
    });
    return res.data;
  },
  startRun: async () => {
    const res = await ApiService.fetchData<any, UpdateRun>({
      url: '/api/update/run',
      method: 'POST',
    });
    return res.data;
  },
  getLatestRun: async () => {
    const res = await ApiService.fetchData<any, UpdateRun | null>({
      url: '/api/update/runs/latest',
      method: 'GET',
    });
    return res.data;
  },
  getRun: async (runId: string) => {
    const res = await ApiService.fetchData<any, UpdateRun>({
      url: `/api/update/runs/${runId}`,
      method: 'GET',
    });
    return res.data;
  },
  streamUpdate: (handlers: {
    onEvent: (event: UpdateEvent) => void;
    onDone: () => void;
    onError: (message: string) => void;
  }) => {
    const source = new EventSource('/api/update/run/stream');
    source.onmessage = (message) => handlers.onEvent(JSON.parse(message.data) as UpdateEvent);
    source.onerror = () => {
      source.close();
      handlers.onError('Mất kết nối khi cập nhật');
    };
    return () => source.close();
  },
  streamRun: (
    runId: string,
    handlers: {
      onEvent: (event: UpdateEvent) => void;
      onDone: () => void;
      onError: (message: string) => void;
    }
  ) => {
    const source = new EventSource(`/api/update/runs/${runId}/stream`);
    source.onmessage = (message) => handlers.onEvent(JSON.parse(message.data) as UpdateEvent);
    source.onerror = () => {
      source.close();
      handlers.onError('Mất kết nối theo dõi cập nhật');
    };
    return () => source.close();
  },
};
