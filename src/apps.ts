import * as vscode from 'vscode';
import { get, post, patch, del, sseConnect, SSEConnection } from './orchestrator';
import { log } from './utils';

export interface AppInfo {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  example?: boolean;
  default?: boolean;
}

export interface CreateAppData {
  name: string;
  description?: string;
  icon?: string;
}

export interface UpdateAppData {
  name?: string;
  description?: string;
  icon?: string;
  default?: boolean;
}

export async function listApps(filter?: string, status?: string): Promise<AppInfo[]> {
  const params: Record<string, string> = {};
  if (filter) params.filter = filter;
  if (status) params.status = status;
  return get<AppInfo[]>('/apps', params);
}

export async function getApp(id: string): Promise<AppInfo> {
  return get<AppInfo>(`/apps/${id}`);
}

export async function createApp(data: CreateAppData, skipSketch = false): Promise<AppInfo> {
  const params = skipSketch ? { 'skip-sketch': 'true' } : undefined;
  return post<AppInfo>('/apps', data, params);
}

export async function updateApp(id: string, data: UpdateAppData): Promise<AppInfo> {
  return patch<AppInfo>(`/apps/${id}`, data);
}

export async function deleteApp(id: string): Promise<void> {
  return del(`/apps/${id}`);
}

export async function cloneApp(id: string, name?: string, icon?: string): Promise<AppInfo> {
  return post<AppInfo>(`/apps/${id}/clone`, { name, icon });
}

export interface AppLifecycleCallbacks {
  onProgress?: (pct: number) => void;
  onMessage?: (msg: string) => void;
  onError?: (code: string, msg: string) => void;
  onDone?: () => void;
}

export function startApp(id: string, cbs: AppLifecycleCallbacks): SSEConnection {
  return sseConnect(`/apps/${id}/start`, {
    onEvent: (name, data) => {
      switch (name) {
        case 'progress':
          cbs.onProgress?.(data.progress);
          break;
        case 'message':
          cbs.onMessage?.(data.message || data);
          break;
        case 'error':
          cbs.onError?.(data.code, data.message);
          break;
      }
    },
    onClose: () => cbs.onDone?.()
  });
}

export function stopApp(id: string, cbs: AppLifecycleCallbacks): SSEConnection {
  return sseConnect(`/apps/${id}/stop`, {
    onEvent: (name, data) => {
      switch (name) {
        case 'progress':
          cbs.onProgress?.(data.progress);
          break;
        case 'message':
          cbs.onMessage?.(data.message || data);
          break;
        case 'error':
          cbs.onError?.(data.code, data.message);
          break;
      }
    },
    onClose: () => cbs.onDone?.()
  });
}

let logsConnection: SSEConnection | null = null;

export function streamLogs(id: string, onLog: (line: string) => void, onErr?: (e: Error) => void): SSEConnection {
  stopLogStream();
  logsConnection = sseConnect(`/apps/${id}/logs`, {
    onEvent: (name, data) => {
      if (name === 'log' || name === 'message') {
        onLog(typeof data === 'string' ? data : JSON.stringify(data));
      }
    },
    onError: onErr
  });
  return logsConnection;
}

export function stopLogStream() {
  logsConnection?.close();
  logsConnection = null;
}

let eventsConnection: SSEConnection | null = null;

export function subscribeEvents(onEvent: (app: AppInfo) => void): SSEConnection {
  eventsConnection?.close();
  eventsConnection = sseConnect('/apps/events', {
    onEvent: (name, data) => {
      if (name === 'app') onEvent(data as AppInfo);
    }
  });
  return eventsConnection;
}

export function subscribeAppEvents(id: string, onEvent: (app: AppInfo) => void): SSEConnection {
  return sseConnect(`/apps/${id}/events`, {
    onEvent: (name, data) => {
      if (name === 'app') onEvent(data as AppInfo);
    }
  });
}

export async function getPorts(id: string): Promise<{ port: number; protocol: string }[]> {
  return get(`/apps/${id}/exposed-ports`);
}

export async function startAppWithProgress(id: string): Promise<boolean> {
  return new Promise(resolve => {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Starting app...',
      cancellable: false
    }, async progress => {
      return new Promise<void>(done => {
        const conn = startApp(id, {
          onProgress: pct => progress.report({ increment: pct * 100 }),
          onMessage: msg => log('info', msg),
          onError: (code, msg) => {
            log('error', `Start failed: ${code} - ${msg}`);
            resolve(false);
            done();
          },
          onDone: () => {
            resolve(true);
            done();
          }
        });
      });
    });
  });
}

export async function stopAppWithProgress(id: string): Promise<boolean> {
  return new Promise(resolve => {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Stopping app...',
      cancellable: false
    }, async progress => {
      return new Promise<void>(done => {
        const conn = stopApp(id, {
          onProgress: pct => progress.report({ increment: pct * 100 }),
          onMessage: msg => log('info', msg),
          onError: (code, msg) => {
            log('error', `Stop failed: ${code} - ${msg}`);
            resolve(false);
            done();
          },
          onDone: () => {
            resolve(true);
            done();
          }
        });
      });
    });
  });
}
