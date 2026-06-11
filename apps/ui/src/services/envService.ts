import ApiService from './base/apiService';

export const envService = {
  getEnv: async () => {
    const res = await ApiService.fetchData<any, { content: string }>({
      url: '/api/env',
      method: 'GET',
    });
    return res.data;
  },
  saveEnv: async (content: string) => {
    const res = await ApiService.fetchData<any, { message: string }>({
      url: '/api/env',
      method: 'POST',
      data: { content },
    });
    return res.data;
  },
};
