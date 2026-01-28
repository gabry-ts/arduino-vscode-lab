import axios, { AxiosError, AxiosRequestConfig, Method } from 'axios';
import { getOrchestratorUrl } from './board';
import { log, showError, showWarning } from './utils';

function getBaseUrl(): string {
  const url = getOrchestratorUrl();
  if (!url) throw new Error('Not connected to board');
  return url;
}

export async function request<T = any>(
  method: Method,
  path: string,
  body?: any,
  params?: Record<string, any>
): Promise<T> {
  const url = `${getBaseUrl()}/v1${path}`;
  log('debug', `${method.toUpperCase()} ${path}`);

  try {
    const cfg: AxiosRequestConfig = { method, url, params };
    if (body) cfg.data = body;
    const res = await axios(cfg);
    return res.data as T;
  } catch (err) {
    const ae = err as AxiosError;
    const msg = ae.response?.data as any;
    const errMsg = msg?.message || msg?.error || ae.message;
    log('error', `HTTP ${method} ${path} failed: ${errMsg}`);
    throw new Error(errMsg);
  }
}

export const get = <T = any>(path: string, params?: Record<string, any>) =>
  request<T>('GET', path, undefined, params);

export const post = <T = any>(path: string, body?: any, params?: Record<string, any>) =>
  request<T>('POST', path, body, params);

export const put = <T = any>(path: string, body?: any, params?: Record<string, any>) =>
  request<T>('PUT', path, body, params);

export const patch = <T = any>(path: string, body?: any) =>
  request<T>('PATCH', path, body);

export const del = <T = any>(path: string) =>
  request<T>('DELETE', path);

export interface SSEHandlers {
  onEvent?: (name: string, data: any) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export interface SSEConnection {
  close: () => void;
}

// SSE disabled - eventsource module has bundling issues
// TODO: implement with native http module or use polling
export function sseConnect(path: string, handlers: SSEHandlers): SSEConnection {
  log('warn', 'SSE not available - streaming features disabled');
  showWarning('Streaming not available. Use refresh to update.');

  // Return dummy connection
  return {
    close: () => {}
  };
}
