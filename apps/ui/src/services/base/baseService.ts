import axios from 'axios';
import { ApiResponse } from '../types';

const BaseService = axios.create({
  timeout: 60000,
  baseURL: '/',
});

BaseService.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as ApiResponse<any>;
    if (apiResponse && typeof apiResponse === 'object' && 'success' in apiResponse) {
      if (apiResponse.success) {
        response.data = apiResponse.data;
      } else {
        const errorMsg = apiResponse.error || 'Yêu cầu thất bại';
        const err = new Error(errorMsg);
        (err as any).response = response;
        return Promise.reject(err);
      }
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default BaseService;
