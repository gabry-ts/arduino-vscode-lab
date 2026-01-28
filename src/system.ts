import { get, put, del, sseConnect, SSEConnection } from './orchestrator';
import { log } from './utils';

export interface VersionInfo {
  version: string;
  build?: string;
}

export interface ConfigInfo {
  data_dir?: string;
  apps_dir?: string;
}

export async function getVersion(): Promise<VersionInfo> {
  return get<VersionInfo>('/version');
}

export async function getConfig(): Promise<ConfigInfo> {
  return get<ConfigInfo>('/config');
}

export interface ResourceEvent {
  type: 'cpu' | 'mem' | 'disk';
  data: any;
}

export function streamResources(onEvent: (e: ResourceEvent) => void): SSEConnection {
  return sseConnect('/system/resources', {
    onEvent: (name, data) => {
      if (['cpu', 'mem', 'disk'].includes(name)) {
        onEvent({ type: name as ResourceEvent['type'], data });
      }
    }
  });
}

export async function listProps(): Promise<string[]> {
  return get<string[]>('/properties');
}

export async function getProp(key: string): Promise<string> {
  return get<string>(`/properties/${encodeURIComponent(key)}`);
}

export async function setProp(key: string, value: string): Promise<void> {
  return put(`/properties/${encodeURIComponent(key)}`, value);
}

export async function delProp(key: string): Promise<void> {
  return del(`/properties/${encodeURIComponent(key)}`);
}

export interface UpdateInfo {
  available: boolean;
  packages?: string[];
}

export async function checkUpdates(onlyArduino = false): Promise<UpdateInfo> {
  const params = onlyArduino ? { 'only-arduino': 'true' } : undefined;
  return get<UpdateInfo>('/system/update/check', params);
}

export interface UpdateCallbacks {
  onLog?: (msg: string) => void;
  onRestarting?: (msg: string) => void;
  onError?: (code: string, msg: string) => void;
}

export function applyUpdates(onlyArduino: boolean, cbs: UpdateCallbacks): SSEConnection {
  const params = onlyArduino ? { 'only-arduino': 'true' } : {};

  put('/system/update/apply', undefined, params).catch(err => {
    log('error', `Update apply failed: ${err.message}`);
  });

  return sseConnect('/system/update/events', {
    onEvent: (name, data) => {
      switch (name) {
        case 'log':
          cbs.onLog?.(typeof data === 'string' ? data : data.message || JSON.stringify(data));
          break;
        case 'restarting':
          cbs.onRestarting?.(typeof data === 'string' ? data : data.message || 'Restarting...');
          break;
        case 'error':
          cbs.onError?.(data.code || 'ERROR', data.message || 'Unknown error');
          break;
      }
    }
  });
}

export async function getName(): Promise<string> {
  try {
    return await getProp('board.name');
  } catch {
    return 'Arduino UNO Q';
  }
}

export async function setName(name: string): Promise<void> {
  return setProp('board.name', name);
}

export interface KeyboardLayout {
  id: string;
  name: string;
}

export async function listKeyboards(): Promise<KeyboardLayout[]> {
  try {
    const data = await getProp('keyboard.layouts');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function getKeyboard(): Promise<string> {
  try {
    return await getProp('keyboard.layout');
  } catch {
    return 'us';
  }
}

export async function setKeyboard(id: string): Promise<void> {
  return setProp('keyboard.layout', id);
}
