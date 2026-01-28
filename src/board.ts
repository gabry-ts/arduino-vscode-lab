import * as vscode from 'vscode';
import { spawn, ChildProcess, execSync, SpawnOptionsWithoutStdio } from 'child_process';
import { getConfig } from './config';
import { log, parseJson, showError, showInfo } from './utils';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const FQBN = 'arduino:zephyr:unoq';
const ORCH_PORT = 8800;

export interface Board {
  port: { address: string; protocol: string; label?: string; hardware_id?: string };
  matching_boards?: { name: string; fqbn: string }[];
}

export interface BoardState {
  board: Board | null;
  password?: string;
  tunnelPort?: number;
  adbSerial?: string;
}

let state: BoardState = { board: null };
let adbPath: string | null = null;

function findAdbPath(): string | null {
  if (adbPath) return adbPath;

  const home = os.homedir();
  const adbRelPath = 'packages/arduino/tools/adb/32.0.0/adb';
  const paths: string[] = [];

  if (process.platform === 'darwin') {
    paths.push(path.join(home, 'Library/Arduino15', adbRelPath));
  } else if (process.platform === 'linux') {
    paths.push(path.join(home, '.arduino15', adbRelPath));
  } else if (process.platform === 'win32') {
    paths.push(path.join(home, 'AppData/Local/Arduino15', adbRelPath + '.exe'));
  }

  for (const p of paths) {
    if (fs.existsSync(p)) {
      adbPath = p;
      return p;
    }
  }

  try {
    const which = execSync('which adb 2>/dev/null || where adb 2>nul', { encoding: 'utf8' }).trim();
    if (which) {
      adbPath = which;
      return which;
    }
  } catch {}

  return null;
}

export function checkCliInstalled(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      execSync(`${getConfig().arduinoCliPath} version`, { stdio: 'ignore' });
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

export function runCli(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise(resolve => {
    const cli = getConfig().arduinoCliPath;
    log('debug', `Running: ${cli} ${args.join(' ')}`);
    const proc = spawn(cli, args, { cwd, shell: true } as SpawnOptionsWithoutStdio);
    let stdout = '', stderr = '';
    proc.stdout?.on('data', d => stdout += d);
    proc.stderr?.on('data', d => stderr += d);
    proc.on('close', code => resolve({ stdout, stderr, code: code ?? 0 }));
    proc.on('error', () => resolve({ stdout, stderr, code: 1 }));
  });
}

export function runCliSync(args: string[]): string {
  const cli = getConfig().arduinoCliPath;
  return execSync(`${cli} ${args.join(' ')}`, { encoding: 'utf8' });
}

export async function detectBoards(): Promise<Board[]> {
  const { stdout, code } = await runCli(['board', 'list', '--format', 'json']);
  if (code !== 0) return [];
  const parsed = parseJson<{ detected_ports?: Board[] }>(stdout);
  return parsed?.detected_ports || [];
}

export function filterArduinoQ(boards: Board[]): Board[] {
  return boards.filter(b =>
    b.matching_boards?.some(m => m.fqbn === FQBN)
  );
}

export function getBoardPort(b: Board): string {
  return b.port.address;
}

export function getBoardProtocol(b: Board): string {
  return b.port.protocol;
}

export function getBoardSerial(b: Board): string | undefined {
  return b.port.hardware_id?.toLowerCase();
}

export function selectBoard(b: Board, password?: string) {
  state.board = b;
  state.password = password;
  log('info', `Selected board at ${b.port.address}`);
}

export function getSelectedBoard(): Board | null {
  return state.board;
}

export function clearBoard() {
  state.board = null;
  state.password = undefined;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(true));
    srv.once('listening', () => {
      srv.close();
      resolve(false);
    });
    srv.listen(port);
  });
}

export async function startTunnel(serial: string): Promise<number> {
  const adb = findAdbPath();
  if (!adb) {
    throw new Error('ADB not found. Install Arduino IDE or android-platform-tools');
  }

  let localPort = ORCH_PORT;
  if (await isPortInUse(localPort)) {
    localPort = await findFreePort();
  }

  log('info', `Starting ADB forward for ${serial} on port ${localPort}`);

  try {
    execSync(`"${adb}" -s ${serial} forward tcp:${localPort} tcp:${ORCH_PORT}`, { encoding: 'utf8' });
  } catch (err) {
    throw new Error(`ADB forward failed: ${err}`);
  }

  state.tunnelPort = localPort;
  state.adbSerial = serial;

  return localPort;
}

export function stopTunnel() {
  const adb = findAdbPath();
  if (adb && state.adbSerial) {
    try {
      execSync(`"${adb}" -s ${state.adbSerial} forward --remove-all`, { stdio: 'ignore' });
    } catch {}
  }
  state.tunnelPort = undefined;
  state.adbSerial = undefined;
  log('info', 'ADB forward removed');
}

export function getTunnelPort(): number | undefined {
  return state.tunnelPort;
}

export function isTunnelActive(): boolean {
  return state.tunnelPort !== undefined;
}

export async function connect(board: Board, password?: string): Promise<boolean> {
  selectBoard(board, password);
  const proto = getBoardProtocol(board);

  if (proto === 'serial') {
    const serial = getBoardSerial(board);
    if (!serial) {
      showError('Board serial number not found');
      return false;
    }
    try {
      await startTunnel(serial);
      showInfo(`Connected via ADB on port ${state.tunnelPort}`);
      return true;
    } catch (err) {
      showError('Failed to start ADB forward', err);
      return false;
    }
  }
  return true;
}

export function disconnect() {
  stopTunnel();
  clearBoard();
}

export function isConnected(): boolean {
  if (!state.board) return false;
  if (getBoardProtocol(state.board) === 'serial') {
    return isTunnelActive();
  }
  return true;
}

export function getOrchestratorUrl(): string | null {
  if (!state.board) return null;
  const proto = getBoardProtocol(state.board);
  if (proto === 'serial') {
    return state.tunnelPort ? `http://localhost:${state.tunnelPort}` : null;
  }
  return `http://${getBoardPort(state.board)}:${ORCH_PORT}`;
}

export async function showBoardPicker(): Promise<Board | undefined> {
  const boards = await detectBoards();
  const qBoards = filterArduinoQ(boards);

  if (qBoards.length === 0) {
    showError('No Arduino UNO Q boards found');
    return undefined;
  }

  const items = qBoards.map(b => ({
    label: b.port.label || getBoardSerial(b) || b.port.address,
    description: `${b.port.protocol} - ${getBoardSerial(b) || b.port.address}`,
    board: b
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select Arduino UNO Q board'
  });

  return pick?.board;
}

export async function compile(sketchPath: string, onOut?: (s: string) => void): Promise<{ success: boolean; diagnostics: any[] }> {
  const { stdout, stderr, code } = await runCli([
    'compile', '--fqbn', FQBN, sketchPath, '--format', 'json'
  ]);

  onOut?.(stdout + stderr);
  const parsed = parseJson<{ success?: boolean; compiler_err?: string }>(stdout);

  return {
    success: code === 0 && (parsed?.success !== false),
    diagnostics: []
  };
}

export async function upload(sketchPath: string, port: string, onOut?: (s: string) => void): Promise<boolean> {
  const { stdout, stderr, code } = await runCli([
    'upload', '--fqbn', FQBN, '--port', port, sketchPath
  ]);

  onOut?.(stdout + stderr);
  return code === 0;
}

export async function compileAndUpload(sketchPath: string, port: string, onOut?: (s: string) => void): Promise<boolean> {
  const { success } = await compile(sketchPath, onOut);
  if (!success) return false;
  return upload(sketchPath, port, onOut);
}

export function findSketch(dir: string): string | null {
  const files = fs.readdirSync(dir);
  const ino = files.find((f: string) => f.endsWith('.ino'));
  return ino ? path.join(dir, ino) : null;
}

export function getCurrentSketch(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.fileName.endsWith('.ino')) {
    return editor.document.fileName;
  }
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (ws) return findSketch(ws.uri.fsPath);
  return null;
}
