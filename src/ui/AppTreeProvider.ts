import * as vscode from 'vscode';
import { AppInfo, listApps, subscribeEvents } from '../apps';
import { isConnected } from '../board';
import { log } from '../utils';

export class AppTreeItem extends vscode.TreeItem {
  constructor(public readonly app: AppInfo) {
    super(app.name, vscode.TreeItemCollapsibleState.None);
    this.description = app.status;
    this.tooltip = `${app.name}\n${app.description || ''}\nStatus: ${app.status}`;
    this.contextValue = `app-${app.status}`;

    const iconMap: Record<string, string> = {
      running: 'play-circle',
      stopped: 'circle-outline',
      starting: 'loading~spin',
      stopping: 'loading~spin',
      failed: 'error'
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[app.status] || 'circle-outline');
  }
}

export class AppTreeProvider implements vscode.TreeDataProvider<AppTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AppTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private apps: AppInfo[] = [];
  private eventsConn: { close: () => void } | null = null;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  async fetchApps(): Promise<void> {
    if (!isConnected()) {
      this.apps = [];
      this.refresh();
      return;
    }

    try {
      this.apps = await listApps();
      this.refresh();
    } catch (err) {
      log('error', `Failed to fetch apps: ${err}`);
      this.apps = [];
      this.refresh();
    }
  }

  subscribeToEvents(): void {
    if (this.eventsConn) return;
    if (!isConnected()) return;

    try {
      this.eventsConn = subscribeEvents(app => {
        const idx = this.apps.findIndex(a => a.id === app.id);
        if (idx >= 0) {
          this.apps[idx] = app;
        } else {
          this.apps.push(app);
        }
        this.refresh();
      });
    } catch (err) {
      log('error', `Failed to subscribe to events: ${err}`);
    }
  }

  unsubscribeFromEvents(): void {
    this.eventsConn?.close();
    this.eventsConn = null;
  }

  getTreeItem(element: AppTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): AppTreeItem[] {
    if (!isConnected()) return [];
    return this.apps.map(a => new AppTreeItem(a));
  }

  getApp(id: string): AppInfo | undefined {
    return this.apps.find(a => a.id === id);
  }
}
