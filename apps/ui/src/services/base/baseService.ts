import { notifications } from '@mantine/notifications';
import axios, { type AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '../types';

type BackendMessagePayload = {
  message?: unknown;
};

type ToastedError = Error & {
  response?: unknown;
  hasBackendToast?: boolean;
};

const BaseService = axios.create({
  timeout: 60000,
  baseURL: '/',
});

function isBackendMessagePayload(data: unknown): data is BackendMessagePayload {
  return typeof data === 'object' && data !== null && 'message' in data;
}

function shouldShowSuccessToast(config?: AxiosRequestConfig) {
  return (config?.method ?? 'get').toLowerCase() !== 'get';
}

function showBackendErrorToast(message: string) {
  notifications.show({
    color: 'red',
    title: 'Lỗi',
    message,
  });
}

function showBackendSuccessToast(message: string) {
  notifications.show({
    color: 'green',
    title: 'Thành công',
    message,
  });
}

BaseService.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as ApiResponse<unknown>;
    if (apiResponse && typeof apiResponse === 'object' && 'success' in apiResponse) {
      if (apiResponse.success) {
        if (
          shouldShowSuccessToast(response.config) &&
          isBackendMessagePayload(apiResponse.data) &&
          typeof apiResponse.data.message === 'string' &&
          apiResponse.data.message.trim().length > 0
        ) {
          showBackendSuccessToast(apiResponse.data.message);
        }
        response.data = apiResponse.data;
      } else {
        const errorMsg = apiResponse.error || 'Yêu cầu thất bại';
        showBackendErrorToast(errorMsg);
        const err: ToastedError = new Error(errorMsg);
        err.response = response;
        err.hasBackendToast = true;
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
