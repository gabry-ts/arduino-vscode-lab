import * as vscode from 'vscode';
import { isConnected, getSelectedBoard, getBoardPort } from '../board';

export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'arduinoQ.showStatus';
    this.update();
    this.item.show();
  }

  update(): void {
    if (isConnected()) {
      const board = getSelectedBoard();
      const port = board ? getBoardPort(board) : '';
      this.item.text = `$(plug) Arduino Q: ${port}`;
      this.item.tooltip = 'Connected - Click for status';
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = '$(debug-disconnect) Arduino Q: Disconnected';
      this.item.tooltip = 'Click to connect';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
