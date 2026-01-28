import { log, showError, showWarning } from './utils';
import { getConfig } from './config';

// Serial port stub - native serialport causes issues with VSCode extensions
// TODO: implement via orchestrator API or use VSCode's built-in serial support

let isPortOpen = false;

export interface SerialCallbacks {
  onData?: (line: string) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export async function listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
  showWarning('Serial port listing not available. Use orchestrator API instead.');
  return [];
}

export function openPort(addr: string, baud?: number, cbs?: SerialCallbacks): boolean {
  showWarning('Direct serial port not available. Board communicates via orchestrator API.');
  return false;
}

export function closePort() {
  isPortOpen = false;
}

export function isOpen(): boolean {
  return isPortOpen;
}

export function write(data: string): boolean {
  return false;
}

export function writeLine(data: string): boolean {
  return false;
}

export function getPort(): null {
  return null;
}
