import type { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import BaseService from './baseService';

const ApiService = {
  fetchData<TReq, TRes>(config: AxiosRequestConfig<TReq>): Promise<AxiosResponse<TRes>> {
    return new Promise((resolve, reject) => {
      BaseService(config)
        .then((response: AxiosResponse<TRes>) => resolve(response))
        .catch((error: AxiosError) => reject(error));
    });
  },
};

export default ApiService;
