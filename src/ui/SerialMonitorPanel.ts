import * as vscode from 'vscode';
import { openPort, closePort, write, isOpen } from '../serial';
import { getConfig } from '../config';
import { log } from '../utils';

export class SerialMonitorPanel {
  public static currentPanel: SerialMonitorPanel | undefined;
  private static readonly viewType = 'arduinoQ.serialMonitor';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private lines: string[] = [];
  private disposed = false;
  private currentPort?: string;
  private currentBaud: number;

  public static createOrShow(extensionUri: vscode.Uri, port?: string) {
    const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (SerialMonitorPanel.currentPanel) {
      SerialMonitorPanel.currentPanel.panel.reveal(column);
      if (port) SerialMonitorPanel.currentPanel.connect(port);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      SerialMonitorPanel.viewType,
      'Serial Monitor',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    SerialMonitorPanel.currentPanel = new SerialMonitorPanel(panel, extensionUri, port);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, port?: string) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.currentBaud = getConfig().defaultBaudRate;

    this.updateHtml();

    this.panel.onDidDispose(() => this.dispose());

    this.panel.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'send':
          if (msg.text) write(msg.text + '\n');
          break;
        case 'clear':
          this.clear();
          break;
        case 'setBaud':
          this.setBaud(Number(msg.baud));
          break;
        case 'disconnect':
          this.disconnect();
          break;
      }
    });

    if (port) this.connect(port);
  }

  public connect(port: string) {
    this.disconnect();
    this.currentPort = port;

    openPort(port, this.currentBaud, {
      onData: line => this.appendLine(line),
      onError: err => this.appendLine(`[ERROR] ${err.message}`),
      onClose: () => this.appendLine('[Disconnected]')
    });

    this.appendLine(`[Connected to ${port} at ${this.currentBaud} baud]`);
  }

  public disconnect() {
    if (isOpen()) {
      closePort();
      this.currentPort = undefined;
    }
  }

  public setBaud(baud: number) {
    this.currentBaud = baud;
    if (this.currentPort) {
      this.disconnect();
      this.connect(this.currentPort);
    }
  }

  public appendLine(line: string) {
    if (this.disposed) return;
    const scrollback = getConfig().serialMonitorScrollback;
    this.lines.push(line);
    if (this.lines.length > scrollback) {
      this.lines = this.lines.slice(-scrollback);
    }
    this.panel.webview.postMessage({ command: 'append', line });
  }

  public clear() {
    this.lines = [];
    this.panel.webview.postMessage({ command: 'clear' });
  }

  private updateHtml() {
    const bauds = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
    const baudOptions = bauds.map(b =>
      `<option value="${b}" ${b === this.currentBaud ? 'selected' : ''}>${b}</option>`
    ).join('');

    this.panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: monospace; padding: 0; margin: 0; display: flex; flex-direction: column; height: 100vh; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
    #toolbar { padding: 8px; display: flex; gap: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    #output { flex: 1; overflow-y: auto; padding: 8px; white-space: pre-wrap; font-size: 13px; }
    #input-row { padding: 8px; display: flex; gap: 8px; border-top: 1px solid var(--vscode-panel-border); }
    input, select, button { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; }
    input { flex: 1; }
    button { cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div id="toolbar">
    <select id="baud" onchange="setBaud(this.value)">${baudOptions}</select>
    <button onclick="clearOutput()">Clear</button>
    <button onclick="disconnect()">Disconnect</button>
  </div>
  <div id="output"></div>
  <div id="input-row">
    <input type="text" id="input" placeholder="Send..." onkeypress="if(event.key==='Enter')send()">
    <button onclick="send()">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const output = document.getElementById('output');
    const input = document.getElementById('input');

    function send() {
      const text = input.value;
      if (text) {
        vscode.postMessage({ command: 'send', text });
        input.value = '';
      }
    }

    function clearOutput() {
      vscode.postMessage({ command: 'clear' });
    }

    function setBaud(baud) {
      vscode.postMessage({ command: 'setBaud', baud });
    }

    function disconnect() {
      vscode.postMessage({ command: 'disconnect' });
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.command === 'append') {
        output.textContent += msg.line + '\\n';
        output.scrollTop = output.scrollHeight;
      } else if (msg.command === 'clear') {
        output.textContent = '';
      }
    });
  </script>
</body>
</html>`;
  }

  public dispose() {
    SerialMonitorPanel.currentPanel = undefined;
    this.disconnect();
    this.disposed = true;
    this.panel.dispose();
  }
}
