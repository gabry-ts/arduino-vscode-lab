import * as vscode from 'vscode';

export interface Config {
  arduinoCliPath: string;
  defaultBaudRate: number;
  autoConnect: boolean;
  serialMonitorScrollback: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  const cfg = vscode.workspace.getConfiguration('arduinoQ');
  return {
    arduinoCliPath: cfg.get('arduinoCliPath', 'arduino-cli'),
    defaultBaudRate: cfg.get('defaultBaudRate', 9600),
    autoConnect: cfg.get('autoConnect', true),
    serialMonitorScrollback: cfg.get('serialMonitor.scrollback', 1000),
    logLevel: cfg.get('logLevel', 'info')
  };
}

export function onConfigChange(cb: (cfg: Config) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('arduinoQ')) {
      cachedConfig = null;
      cb(getConfig());
    }
  });
}
