import ApiService from './base/apiService';
import type { UpdateEvent, UpdateStatus } from './types';

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
};
