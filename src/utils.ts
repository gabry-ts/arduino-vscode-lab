import * as vscode from 'vscode';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let outputChannel: vscode.OutputChannel | null = null;
let currentLogLevel: LogLevel = 'info';

const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function initLogger(channel: vscode.OutputChannel, level: LogLevel = 'info') {
  outputChannel = channel;
  currentLogLevel = level;
}

export function setLogLevel(level: LogLevel) {
  currentLogLevel = level;
}

export function log(level: LogLevel, msg: string) {
  if (!outputChannel || levels[level] < levels[currentLogLevel]) return;
  const ts = new Date().toISOString().substring(11, 19);
  outputChannel.appendLine(`[${ts}] [${level.toUpperCase()}] ${msg}`);
}

export function showError(msg: string, err?: unknown) {
  const errMsg = err instanceof Error ? err.message : String(err || '');
  const full = errMsg ? `${msg}: ${errMsg}` : msg;
  log('error', full);
  vscode.window.showErrorMessage(full);
}

export function showInfo(msg: string) {
  log('info', msg);
  vscode.window.showInformationMessage(msg);
}

export function showWarning(msg: string) {
  log('warn', msg);
  vscode.window.showWarningMessage(msg);
}

export function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
