import * as vscode from 'vscode';
import { exec } from 'child_process';
import { getSelectedBoard, getBoardPort } from './board';
import { log, showError } from './utils';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

function sshExec(cmd: string): Promise<string> {
  const board = getSelectedBoard();
  if (!board) throw new Error('No board selected');
  const addr = getBoardPort(board);

  return new Promise((resolve, reject) => {
    exec(`ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@${addr} "${cmd}"`,
      { timeout: 10000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
  });
}

export async function getTree(path: string = '/'): Promise<FileEntry[]> {
  try {
    const out = await sshExec(`find ${path} -maxdepth 2 -print`);
    const lines = out.trim().split('\n').filter(l => l && l !== path);

    const entries: FileEntry[] = [];
    const dirs = new Set<string>();

    for (const line of lines) {
      const isDir = !line.includes('.');
      if (isDir) dirs.add(line);
    }

    for (const line of lines) {
      const parts = line.split('/');
      const name = parts[parts.length - 1];
      if (!name) continue;

      entries.push({
        name,
        path: line,
        type: dirs.has(line) ? 'directory' : 'file'
      });
    }

    return entries;
  } catch (err) {
    log('error', `Failed to get tree: ${err}`);
    return [];
  }
}

export async function readFile(path: string): Promise<string> {
  return sshExec(`cat "${path}"`);
}

export async function writeFile(path: string, content: string): Promise<void> {
  const escaped = content.replace(/'/g, "'\\''");
  await sshExec(`echo '${escaped}' > "${path}"`);
}

export async function createFolder(path: string): Promise<void> {
  await sshExec(`mkdir -p "${path}"`);
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  await sshExec(`mv "${oldPath}" "${newPath}"`);
}

export async function deleteFile(path: string): Promise<void> {
  await sshExec(`rm -rf "${path}"`);
}

export class ArduinoQFileSystemProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._emitter.event;

  watch(): vscode.Disposable {
    return { dispose: () => {} };
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const path = uri.path;
    try {
      const out = await sshExec(`stat -c "%s %Y" "${path}" 2>/dev/null || echo "0 0"`);
      const [size, mtime] = out.trim().split(' ').map(Number);
      const isDir = await sshExec(`test -d "${path}" && echo 1 || echo 0`);

      return {
        type: isDir.trim() === '1' ? vscode.FileType.Directory : vscode.FileType.File,
        ctime: 0,
        mtime: mtime * 1000,
        size
      };
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const entries = await getTree(uri.path);
    return entries.map(e => [e.name, e.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File]);
  }

  createDirectory(uri: vscode.Uri): Promise<void> {
    return createFolder(uri.path);
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const content = await readFile(uri.path);
    return Buffer.from(content);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    await writeFile(uri.path, content.toString());
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  async delete(uri: vscode.Uri): Promise<void> {
    await deleteFile(uri.path);
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    await rename(oldUri.path, newUri.path);
    this._emitter.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri }
    ]);
  }
}
