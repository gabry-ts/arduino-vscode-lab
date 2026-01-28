import { get, put, del } from './orchestrator';

export interface LibraryRelease {
  id: string;
  version: string;
}

export interface Library {
  id: string;
  name: string;
  author?: string;
  sentence?: string;
  paragraph?: string;
  architectures?: string[];
  platform?: string | null;
  releases?: LibraryRelease[];
}

export interface SearchOpts {
  architecture?: string;
  platform?: string;
  sort?: 'stars_asc' | 'stars_desc' | 'forks_asc' | 'forks_desc' | 'recent_asc' | 'recent_desc';
  page?: number;
  limit?: number;
}

export async function search(query: string, opts?: SearchOpts): Promise<Library[]> {
  const params: Record<string, any> = { search: query };
  if (opts?.architecture) params.architecture = opts.architecture;
  if (opts?.platform) params.platform = opts.platform;
  if (opts?.sort) params.sort = opts.sort;
  if (opts?.page) params.page = opts.page;
  if (opts?.limit) params.limit = opts.limit;
  return get<Library[]>('/libraries', params);
}

export async function listAppLibs(appId: string): Promise<string[]> {
  return get<string[]>(`/apps/${appId}/sketch/libraries/`);
}

export async function addLib(appId: string, libRef: string, addDeps = true): Promise<void> {
  const params = addDeps ? { add_deps: 'true' } : undefined;
  return put(`/apps/${appId}/sketch/libraries/${encodeURIComponent(libRef)}`, undefined, params);
}

export async function removeLib(appId: string, libRef: string): Promise<void> {
  return del(`/apps/${appId}/sketch/libraries/${encodeURIComponent(libRef)}`);
}
