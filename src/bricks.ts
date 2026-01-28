import { get, put, patch, del } from './orchestrator';

export interface ConfigVariable {
  name: string;
  description?: string;
  value?: string;
  required?: boolean;
}

export interface BrickInfo {
  id: string;
  name: string;
  author?: string;
  category?: string;
  description?: string;
  require_model?: boolean;
}

export interface BrickInstance {
  id: string;
  name: string;
  author?: string;
  category?: string;
  status?: string;
  require_model?: boolean;
  model?: string | null;
  config_variables?: ConfigVariable[];
}

export interface BrickConfig {
  model?: string;
  variables?: Record<string, string>;
}

export async function listBricks(): Promise<BrickInfo[]> {
  return get<BrickInfo[]>('/bricks');
}

export async function getBrick(id: string): Promise<BrickInfo> {
  return get<BrickInfo>(`/bricks/${id}`);
}

export async function listAppBricks(appId: string): Promise<BrickInstance[]> {
  return get<BrickInstance[]>(`/apps/${appId}/bricks`);
}

export async function getAppBrick(appId: string, brickId: string): Promise<BrickInstance> {
  return get<BrickInstance>(`/apps/${appId}/bricks/${brickId}`);
}

export async function addBrick(appId: string, brickId: string, config?: BrickConfig): Promise<BrickInstance> {
  return put<BrickInstance>(`/apps/${appId}/bricks/${brickId}`, config || {});
}

export async function updateBrick(appId: string, brickId: string, config: BrickConfig): Promise<BrickInstance> {
  return patch<BrickInstance>(`/apps/${appId}/bricks/${brickId}`, config);
}

export async function removeBrick(appId: string, brickId: string): Promise<void> {
  return del(`/apps/${appId}/bricks/${brickId}`);
}
