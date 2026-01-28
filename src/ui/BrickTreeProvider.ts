import * as vscode from 'vscode';
import { BrickInfo, BrickInstance, listBricks, listAppBricks } from '../bricks';
import { isConnected } from '../board';
import { log } from '../utils';

export class BrickTreeItem extends vscode.TreeItem {
  constructor(
    public readonly brick: BrickInfo | BrickInstance,
    public readonly appId?: string
  ) {
    super(brick.name, vscode.TreeItemCollapsibleState.None);
    this.description = brick.category || '';
    this.tooltip = `${brick.name}\n${brick.author || ''}\nCategory: ${brick.category || 'N/A'}`;
    this.contextValue = appId ? 'app-brick' : 'brick';
    this.iconPath = new vscode.ThemeIcon('extensions');
  }
}

export class BrickTreeProvider implements vscode.TreeDataProvider<BrickTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BrickTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private bricks: BrickInfo[] = [];
  private appBricks: Map<string, BrickInstance[]> = new Map();
  private currentAppId?: string;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setCurrentApp(appId?: string): void {
    this.currentAppId = appId;
    this.refresh();
  }

  async fetchBricks(): Promise<void> {
    if (!isConnected()) {
      this.bricks = [];
      this.refresh();
      return;
    }

    try {
      this.bricks = await listBricks();
      this.refresh();
    } catch (err) {
      log('error', `Failed to fetch bricks: ${err}`);
      this.bricks = [];
      this.refresh();
    }
  }

  async fetchAppBricks(appId: string): Promise<void> {
    if (!isConnected()) return;

    try {
      const bricks = await listAppBricks(appId);
      this.appBricks.set(appId, bricks);
      this.refresh();
    } catch (err) {
      log('error', `Failed to fetch app bricks: ${err}`);
    }
  }

  getTreeItem(element: BrickTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): BrickTreeItem[] {
    if (!isConnected()) return [];

    if (this.currentAppId) {
      const appBricks = this.appBricks.get(this.currentAppId) || [];
      return appBricks.map(b => new BrickTreeItem(b, this.currentAppId));
    }

    return this.bricks.map(b => new BrickTreeItem(b));
  }

  getBrick(id: string): BrickInfo | undefined {
    return this.bricks.find(b => b.id === id);
  }
}
