import * as vscode from 'vscode';
import { FileEntry, getTree } from '../files';
import { isConnected } from '../board';
import { log } from '../utils';

export class FileTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: FileEntry) {
    super(
      entry.name,
      entry.type === 'directory'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.tooltip = entry.path;
    this.contextValue = entry.type;

    if (entry.type === 'file') {
      this.command = {
        command: 'arduinoQ.openRemoteFile',
        title: 'Open File',
        arguments: [entry.path]
      };
      this.iconPath = vscode.ThemeIcon.File;
    } else {
      this.iconPath = vscode.ThemeIcon.Folder;
    }
  }
}

export class FileTreeProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private rootPath = '/home';
  private cache: Map<string, FileEntry[]> = new Map();

  refresh(): void {
    this.cache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  setRoot(path: string): void {
    this.rootPath = path;
    this.refresh();
  }

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    if (!isConnected()) return [];

    const path = element?.entry.path || this.rootPath;

    if (this.cache.has(path)) {
      return (this.cache.get(path) || []).map(e => new FileTreeItem(e));
    }

    try {
      const entries = await getTree(path);
      this.cache.set(path, entries);
      return entries.map(e => new FileTreeItem(e));
    } catch (err) {
      log('error', `Failed to get tree: ${err}`);
      return [];
    }
  }
}
