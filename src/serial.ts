import { SerialPort } from 'serialport';
import { log, showError } from './utils';
import { getConfig } from './config';

let port: SerialPort | null = null;
let buffer = '';

export interface SerialCallbacks {
  onData?: (line: string) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

let callbacks: SerialCallbacks = {};

export async function listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
  const ports = await SerialPort.list();
  return ports.map(p => ({ path: p.path, manufacturer: p.manufacturer }));
}

export function openPort(addr: string, baud?: number, cbs?: SerialCallbacks): boolean {
  if (port?.isOpen) {
    closePort();
  }

  callbacks = cbs || {};
  const baudRate = baud || getConfig().defaultBaudRate;

  try {
    port = new SerialPort({ path: addr, baudRate });

    port.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(l => callbacks.onData?.(l));
    });

    port.on('error', err => {
      log('error', `Serial error: ${err.message}`);
      callbacks.onError?.(err);
    });

    port.on('close', () => {
      log('info', 'Serial port closed');
      callbacks.onClose?.();
    });

    log('info', `Opened serial port ${addr} at ${baudRate} baud`);
    return true;
  } catch (err) {
    showError('Failed to open serial port', err);
    return false;
  }
}

export function closePort() {
  if (port?.isOpen) {
    port.close();
    port = null;
    buffer = '';
    log('info', 'Serial port closed');
  }
}

export function isOpen(): boolean {
  return !!port?.isOpen;
}

export function write(data: string): boolean {
  if (!port?.isOpen) return false;
  port.write(data);
  return true;
}

export function writeLine(data: string): boolean {
  return write(data + '\n');
}

export function getPort(): SerialPort | null {
  return port;
}
