import * as vscode from 'vscode';
import { getConfig, onConfigChange } from './config';
import { initLogger, setLogLevel, log, showError, showInfo, showWarning } from './utils';
import {
  checkCliInstalled, detectBoards, filterArduinoQ, showBoardPicker,
  connect, disconnect, isConnected, getSelectedBoard, getBoardPort,
  getOrchestratorUrl, compile, upload, compileAndUpload, getCurrentSketch
} from './board';
import {
  listApps, createApp, deleteApp, startAppWithProgress, stopAppWithProgress,
  streamLogs, stopLogStream
} from './apps';
import { listBricks, addBrick, removeBrick, updateBrick, BrickConfig } from './bricks';
import { ArduinoQFileSystemProvider, readFile } from './files';
import { listSsids, getStatus as wifiStatus, connect as wifiConnect } from './wifi';
import { search as searchLibs, addLib, removeLib, listAppLibs } from './libs';
import { getVersion, checkUpdates, applyUpdates, getName, setName, streamResources, listKeyboards, setKeyboard } from './system';
import {
  AppTreeProvider, BrickTreeProvider, FileTreeProvider,
  SerialMonitorPanel, StatusBar
} from './ui';

let outputChannel: vscode.OutputChannel;
let statusBar: StatusBar;
let appProvider: AppTreeProvider;
let brickProvider: BrickTreeProvider;
let fileProvider: FileTreeProvider;
let logsChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Arduino Q');
  logsChannel = vscode.window.createOutputChannel('Arduino Q - App Logs');

  const cfg = getConfig();
  initLogger(outputChannel, cfg.logLevel);
  log('info', 'Arduino Q extension activating...');

  statusBar = new StatusBar();
  appProvider = new AppTreeProvider();
  brickProvider = new BrickTreeProvider();
  fileProvider = new FileTreeProvider();

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('arduinoq', new ArduinoQFileSystemProvider(), { isCaseSensitive: true })
  );

  const appTree = vscode.window.createTreeView('arduinoQ.apps', { treeDataProvider: appProvider });
  const brickTree = vscode.window.createTreeView('arduinoQ.bricks', { treeDataProvider: brickProvider });
  const fileTree = vscode.window.createTreeView('arduinoQ.files', { treeDataProvider: fileProvider });

  context.subscriptions.push(appTree, brickTree, fileTree);

  context.subscriptions.push(onConfigChange(cfg => {
    setLogLevel(cfg.logLevel);
  }));

  const cmds: [string, (...args: any[]) => any][] = [
    ['arduinoQ.detectBoards', cmdDetectBoards],
    ['arduinoQ.selectBoard', cmdSelectBoard],
    ['arduinoQ.connect', cmdConnect],
    ['arduinoQ.disconnect', cmdDisconnect],
    ['arduinoQ.showStatus', cmdShowStatus],
    ['arduinoQ.refreshApps', cmdRefreshApps],
    ['arduinoQ.createApp', cmdCreateApp],
    ['arduinoQ.deleteApp', cmdDeleteApp],
    ['arduinoQ.startApp', cmdStartApp],
    ['arduinoQ.stopApp', cmdStopApp],
    ['arduinoQ.showAppLogs', cmdShowAppLogs],
    ['arduinoQ.showAppInfo', cmdShowAppInfo],
    ['arduinoQ.openSerialMonitor', cmdOpenSerialMonitor],
    ['arduinoQ.closeSerialMonitor', cmdCloseSerialMonitor],
    ['arduinoQ.clearSerialMonitor', cmdClearSerialMonitor],
    ['arduinoQ.compile', cmdCompile],
    ['arduinoQ.upload', cmdUpload],
    ['arduinoQ.compileUpload', cmdCompileUpload],
    ['arduinoQ.verify', cmdCompile],
    ['arduinoQ.refreshBricks', cmdRefreshBricks],
    ['arduinoQ.showBrickInfo', cmdShowBrickInfo],
    ['arduinoQ.addBrick', cmdAddBrick],
    ['arduinoQ.removeBrick', cmdRemoveBrick],
    ['arduinoQ.configureBrick', cmdConfigureBrick],
    ['arduinoQ.refreshFiles', cmdRefreshFiles],
    ['arduinoQ.openRemoteFile', cmdOpenRemoteFile],
    ['arduinoQ.createRemoteFile', cmdCreateRemoteFile],
    ['arduinoQ.createRemoteFolder', cmdCreateRemoteFolder],
    ['arduinoQ.renameRemote', cmdRenameRemote],
    ['arduinoQ.deleteRemote', cmdDeleteRemote],
    ['arduinoQ.wifiConnect', cmdWifiConnect],
    ['arduinoQ.wifiStatus', cmdWifiStatus],
    ['arduinoQ.searchLibraries', cmdSearchLibraries],
    ['arduinoQ.addLibrary', cmdAddLibrary],
    ['arduinoQ.removeLibrary', cmdRemoveLibrary],
    ['arduinoQ.listLibraries', cmdListLibraries],
    ['arduinoQ.showVersion', cmdShowVersion],
    ['arduinoQ.checkUpdates', cmdCheckUpdates],
    ['arduinoQ.applyUpdates', cmdApplyUpdates],
    ['arduinoQ.setBoardName', cmdSetBoardName],
    ['arduinoQ.setKeyboard', cmdSetKeyboard],
    ['arduinoQ.showResources', cmdShowResources],
    ['arduinoQ.openTerminal', cmdOpenTerminal],
  ];

  for (const [cmd, handler] of cmds) {
    context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
  }

  context.subscriptions.push(statusBar);
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(logsChannel);

  checkCliInstalled().then(ok => {
    if (!ok) {
      showWarning('Arduino CLI not found. Please install it and set the path in settings.');
    }
  });

  if (cfg.autoConnect) {
    detectBoards().then(boards => {
      const qBoards = filterArduinoQ(boards);
      if (qBoards.length === 1) {
        connect(qBoards[0]).then(ok => {
          if (ok) {
            statusBar.update();
            appProvider.fetchApps();
            appProvider.subscribeToEvents();
          }
        });
      }
    });
  }

  log('info', 'Arduino Q extension activated');
}

export function deactivate() {
  disconnect();
  stopLogStream();
  appProvider?.unsubscribeFromEvents();
}

async function cmdDetectBoards() {
  const boards = await detectBoards();
  const qBoards = filterArduinoQ(boards);
  if (qBoards.length === 0) {
    showInfo('No Arduino UNO Q boards found');
  } else {
    showInfo(`Found ${qBoards.length} Arduino UNO Q board(s)`);
  }
}

async function cmdSelectBoard() {
  const board = await showBoardPicker();
  if (board) {
    await connect(board);
    statusBar.update();
    appProvider.fetchApps();
    appProvider.subscribeToEvents();
  }
}

async function cmdConnect() {
  const board = await showBoardPicker();
  if (board) {
    const ok = await connect(board);
    if (ok) {
      showInfo('Connected to board');
      statusBar.update();
      appProvider.fetchApps();
      appProvider.subscribeToEvents();
      brickProvider.fetchBricks();
      fileProvider.refresh();
    }
  }
}

function cmdDisconnect() {
  disconnect();
  showInfo('Disconnected from board');
  statusBar.update();
  appProvider.unsubscribeFromEvents();
  appProvider.refresh();
  brickProvider.refresh();
  fileProvider.refresh();
}

async function cmdShowStatus() {
  if (!isConnected()) {
    const choice = await vscode.window.showInformationMessage(
      'Not connected to any board',
      'Connect'
    );
    if (choice === 'Connect') cmdConnect();
    return;
  }

  const board = getSelectedBoard()!;
  const url = getOrchestratorUrl();
  const version = await getVersion().catch(() => ({ version: 'unknown' }));

  vscode.window.showInformationMessage(
    `Connected to ${getBoardPort(board)}\nOrchestrator: ${url}\nVersion: ${version.version}`
  );
}

async function cmdRefreshApps() {
  try {
    await appProvider.fetchApps();
  } catch (err) {
    showError('Failed to refresh apps', err);
  }
}

async function cmdCreateApp() {
  if (!isConnected()) return showError('Not connected');

  const name = await vscode.window.showInputBox({ prompt: 'App name' });
  if (!name) return;

  try {
    const app = await createApp({ name });
    showInfo(`Created app: ${app.name}`);
    appProvider.fetchApps();
  } catch (err) {
    showError('Failed to create app', err);
  }
}

async function cmdDeleteApp(item?: { app?: { id: string } }) {
  if (!isConnected()) return showError('Not connected');

  try {
    let id = item?.app?.id;
    if (!id) {
      const apps = await listApps();
      const pick = await vscode.window.showQuickPick(
        apps.map(a => ({ label: a.name, id: a.id })),
        { placeHolder: 'Select app to delete' }
      );
      id = pick?.id;
    }
    if (!id) return;

    const confirm = await vscode.window.showWarningMessage('Delete this app?', 'Yes', 'No');
    if (confirm !== 'Yes') return;

    await deleteApp(id);
    showInfo('App deleted');
    appProvider.fetchApps();
  } catch (err) {
    showError('Failed to delete app', err);
  }
}

async function cmdStartApp(item?: { app?: { id: string } }) {
  if (!isConnected()) return showError('Not connected');

  try {
    let id = item?.app?.id;
    if (!id) {
      const apps = await listApps();
      const pick = await vscode.window.showQuickPick(
        apps.filter(a => a.status === 'stopped').map(a => ({ label: a.name, id: a.id })),
        { placeHolder: 'Select app to start' }
      );
      id = pick?.id;
    }
    if (!id) return;

    await startAppWithProgress(id);
    appProvider.fetchApps();
  } catch (err) {
    showError('Failed to start app', err);
  }
}

async function cmdStopApp(item?: { app?: { id: string } }) {
  if (!isConnected()) return showError('Not connected');

  try {
    let id = item?.app?.id;
    if (!id) {
      const apps = await listApps();
      const pick = await vscode.window.showQuickPick(
        apps.filter(a => a.status === 'running').map(a => ({ label: a.name, id: a.id })),
        { placeHolder: 'Select app to stop' }
      );
      id = pick?.id;
    }
    if (!id) return;

    await stopAppWithProgress(id);
    appProvider.fetchApps();
  } catch (err) {
    showError('Failed to stop app', err);
  }
}

async function cmdShowAppLogs(item?: { app?: { id: string } }) {
  if (!isConnected()) return showError('Not connected');

  try {
    let id = item?.app?.id;
    if (!id) {
      const apps = await listApps();
      const pick = await vscode.window.showQuickPick(
        apps.map(a => ({ label: a.name, id: a.id })),
        { placeHolder: 'Select app' }
      );
      id = pick?.id;
    }
    if (!id) return;

    logsChannel.show();
    logsChannel.appendLine(`--- Logs for app ${id} ---`);
    streamLogs(id, line => logsChannel.appendLine(line));
  } catch (err) {
    showError('Failed to show app logs', err);
  }
}

async function cmdShowAppInfo(item?: { app?: { id: string } }) {
  if (!isConnected()) return showError('Not connected');
  const id = item?.app?.id;
  if (!id) return;

  const app = appProvider.getApp(id);
  if (app) {
    vscode.window.showInformationMessage(
      `${app.name}\nStatus: ${app.status}\n${app.description || ''}`
    );
  }
}

function cmdOpenSerialMonitor() {
  const board = getSelectedBoard();
  const port = board ? getBoardPort(board) : undefined;
  SerialMonitorPanel.createOrShow(vscode.Uri.file(''), port);
}

function cmdCloseSerialMonitor() {
  SerialMonitorPanel.currentPanel?.dispose();
}

function cmdClearSerialMonitor() {
  SerialMonitorPanel.currentPanel?.clear();
}

async function cmdCompile() {
  const sketch = getCurrentSketch();
  if (!sketch) return showError('No sketch found');

  outputChannel.show();
  outputChannel.appendLine(`Compiling ${sketch}...`);

  const { success } = await compile(sketch, s => outputChannel.appendLine(s));
  if (success) {
    showInfo('Compilation successful');
  } else {
    showError('Compilation failed');
  }
}

async function cmdUpload() {
  const board = getSelectedBoard();
  if (!board) return showError('No board selected');

  const sketch = getCurrentSketch();
  if (!sketch) return showError('No sketch found');

  outputChannel.show();
  outputChannel.appendLine(`Uploading ${sketch}...`);

  const ok = await upload(sketch, getBoardPort(board), s => outputChannel.appendLine(s));
  if (ok) {
    showInfo('Upload successful');
  } else {
    showError('Upload failed');
  }
}

async function cmdCompileUpload() {
  const board = getSelectedBoard();
  if (!board) return showError('No board selected');

  const sketch = getCurrentSketch();
  if (!sketch) return showError('No sketch found');

  outputChannel.show();
  outputChannel.appendLine(`Compiling and uploading ${sketch}...`);

  const ok = await compileAndUpload(sketch, getBoardPort(board), s => outputChannel.appendLine(s));
  if (ok) {
    showInfo('Compile & upload successful');
  } else {
    showError('Compile & upload failed');
  }
}

async function cmdRefreshBricks() {
  try {
    await brickProvider.fetchBricks();
  } catch (err) {
    showError('Failed to refresh bricks', err);
  }
}

async function cmdShowBrickInfo(item?: { brick?: { id: string } }) {
  const id = item?.brick?.id;
  if (!id) return;
  const brick = brickProvider.getBrick(id);
  if (brick) {
    vscode.window.showInformationMessage(
      `${brick.name}\nAuthor: ${brick.author || 'N/A'}\nCategory: ${brick.category || 'N/A'}`
    );
  }
}

async function cmdAddBrick() {
  if (!isConnected()) return showError('Not connected');

  const apps = await listApps();
  const appPick = await vscode.window.showQuickPick(
    apps.map(a => ({ label: a.name, id: a.id })),
    { placeHolder: 'Select app' }
  );
  if (!appPick) return;

  const bricks = await listBricks();
  const brickPick = await vscode.window.showQuickPick(
    bricks.map(b => ({ label: b.name, description: b.category, id: b.id })),
    { placeHolder: 'Select brick to add' }
  );
  if (!brickPick) return;

  try {
    await addBrick(appPick.id, brickPick.id);
    showInfo('Brick added');
    brickProvider.fetchAppBricks(appPick.id);
  } catch (err) {
    showError('Failed to add brick', err);
  }
}

async function cmdRemoveBrick(item?: { brick?: { id: string }; appId?: string }) {
  if (!isConnected()) return showError('Not connected');
  const brickId = item?.brick?.id;
  const appId = item?.appId;
  if (!brickId || !appId) return;

  try {
    await removeBrick(appId, brickId);
    showInfo('Brick removed');
    brickProvider.fetchAppBricks(appId);
  } catch (err) {
    showError('Failed to remove brick', err);
  }
}

async function cmdConfigureBrick(item?: { brick?: { id: string }; appId?: string }) {
  if (!isConnected()) return showError('Not connected');
  const brickId = item?.brick?.id;
  const appId = item?.appId;
  if (!brickId || !appId) return;

  const varName = await vscode.window.showInputBox({ prompt: 'Variable name' });
  if (!varName) return;
  const varValue = await vscode.window.showInputBox({ prompt: 'Variable value' });
  if (varValue === undefined) return;

  try {
    await updateBrick(appId, brickId, { variables: { [varName]: varValue } });
    showInfo('Brick configured');
  } catch (err) {
    showError('Failed to configure brick', err);
  }
}

function cmdRefreshFiles() {
  fileProvider.refresh();
}

async function cmdOpenRemoteFile(path: string) {
  const uri = vscode.Uri.parse(`arduinoq://${path}`);
  const doc = await vscode.workspace.openTextDocument(uri);
  vscode.window.showTextDocument(doc);
}

async function cmdCreateRemoteFile() {
  if (!isConnected()) return showError('Not connected');
  const path = await vscode.window.showInputBox({ prompt: 'File path (e.g., /home/user/file.txt)' });
  if (!path) return;

  const uri = vscode.Uri.parse(`arduinoq://${path}`);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(''));
  cmdOpenRemoteFile(path);
  fileProvider.refresh();
}

async function cmdCreateRemoteFolder() {
  if (!isConnected()) return showError('Not connected');
  const path = await vscode.window.showInputBox({ prompt: 'Folder path' });
  if (!path) return;

  const uri = vscode.Uri.parse(`arduinoq://${path}`);
  await vscode.workspace.fs.createDirectory(uri);
  fileProvider.refresh();
}

async function cmdRenameRemote(item?: { entry?: { path: string } }) {
  if (!isConnected()) return showError('Not connected');
  const oldPath = item?.entry?.path;
  if (!oldPath) return;

  const newName = await vscode.window.showInputBox({ prompt: 'New name' });
  if (!newName) return;

  const parts = oldPath.split('/');
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');

  const oldUri = vscode.Uri.parse(`arduinoq://${oldPath}`);
  const newUri = vscode.Uri.parse(`arduinoq://${newPath}`);
  await vscode.workspace.fs.rename(oldUri, newUri);
  fileProvider.refresh();
}

async function cmdDeleteRemote(item?: { entry?: { path: string } }) {
  if (!isConnected()) return showError('Not connected');
  const path = item?.entry?.path;
  if (!path) return;

  const confirm = await vscode.window.showWarningMessage('Delete this file/folder?', 'Yes', 'No');
  if (confirm !== 'Yes') return;

  const uri = vscode.Uri.parse(`arduinoq://${path}`);
  await vscode.workspace.fs.delete(uri, { recursive: true });
  fileProvider.refresh();
}

async function cmdWifiConnect() {
  if (!isConnected()) return showError('Not connected');

  try {
    const networks = await listSsids();
    if (networks.length === 0) {
      return showWarning('No WiFi networks found');
    }

    const pick = await vscode.window.showQuickPick(
      networks.map(n => ({ label: n.ssid })),
      { placeHolder: 'Select network' }
    );
    if (!pick) return;

    const pass = await vscode.window.showInputBox({ prompt: 'WiFi password', password: true });
    if (!pass) return;

    const ok = await wifiConnect(pick.label, pass);
    if (ok) {
      showInfo('Connected to WiFi');
    } else {
      showError('Failed to connect to WiFi');
    }
  } catch (err) {
    showError('WiFi connection failed', err);
  }
}

async function cmdWifiStatus() {
  if (!isConnected()) return showError('Not connected');
  try {
    const status = await wifiStatus();
    if (status.connected) {
      showInfo(`WiFi: ${status.ssid} (${status.ip})`);
    } else {
      showInfo('WiFi: Not connected');
    }
  } catch (err) {
    showError('Failed to get WiFi status', err);
  }
}

async function cmdSearchLibraries() {
  const query = await vscode.window.showInputBox({ prompt: 'Search libraries' });
  if (!query) return;

  try {
    const libs = await searchLibs(query);
    const pick = await vscode.window.showQuickPick(
      libs.map(l => ({ label: l.name, description: l.author, detail: l.sentence, lib: l })),
      { placeHolder: 'Select library' }
    );
    if (pick) {
      vscode.window.showInformationMessage(`${pick.lib.name} by ${pick.lib.author}\n${pick.lib.sentence}`);
    }
  } catch (err) {
    showError('Failed to search libraries', err);
  }
}

async function cmdAddLibrary() {
  if (!isConnected()) return showError('Not connected');

  const apps = await listApps();
  const appPick = await vscode.window.showQuickPick(
    apps.map(a => ({ label: a.name, id: a.id })),
    { placeHolder: 'Select app' }
  );
  if (!appPick) return;

  const query = await vscode.window.showInputBox({ prompt: 'Search library' });
  if (!query) return;

  const libs = await searchLibs(query);
  const libPick = await vscode.window.showQuickPick(
    libs.map(l => ({ label: l.name, description: l.author, lib: l })),
    { placeHolder: 'Select library to add' }
  );
  if (!libPick) return;

  try {
    await addLib(appPick.id, libPick.lib.name);
    showInfo('Library added');
  } catch (err) {
    showError('Failed to add library', err);
  }
}

async function cmdRemoveLibrary() {
  if (!isConnected()) return showError('Not connected');

  const apps = await listApps();
  const appPick = await vscode.window.showQuickPick(
    apps.map(a => ({ label: a.name, id: a.id })),
    { placeHolder: 'Select app' }
  );
  if (!appPick) return;

  const libs = await listAppLibs(appPick.id);
  const libPick = await vscode.window.showQuickPick(
    libs.map(l => ({ label: l })),
    { placeHolder: 'Select library to remove' }
  );
  if (!libPick) return;

  try {
    await removeLib(appPick.id, libPick.label);
    showInfo('Library removed');
  } catch (err) {
    showError('Failed to remove library', err);
  }
}

async function cmdListLibraries() {
  if (!isConnected()) return showError('Not connected to board. Use "Arduino Q: Connect" first.');

  try {
    const apps = await listApps();
    const appPick = await vscode.window.showQuickPick(
      apps.map(a => ({ label: a.name, id: a.id })),
      { placeHolder: 'Select app' }
    );
    if (!appPick) return;

    const libs = await listAppLibs(appPick.id);
    if (libs.length === 0) {
      showInfo('No libraries installed');
    } else {
      vscode.window.showInformationMessage(`Libraries: ${libs.join(', ')}`);
    }
  } catch (err) {
    showError('Failed to list libraries', err);
  }
}

async function cmdShowVersion() {
  if (!isConnected()) return showError('Not connected');
  try {
    const v = await getVersion();
    showInfo(`Orchestrator version: ${v.version}`);
  } catch (err) {
    showError('Failed to get version', err);
  }
}

async function cmdCheckUpdates() {
  if (!isConnected()) return showError('Not connected');
  try {
    const info = await checkUpdates();
    if (info.available) {
      showInfo('Updates available');
    } else {
      showInfo('No updates available');
    }
  } catch (err) {
    showError('Failed to check updates', err);
  }
}

async function cmdApplyUpdates() {
  if (!isConnected()) return showError('Not connected');

  const confirm = await vscode.window.showWarningMessage(
    'Apply updates? The board will restart.',
    'Yes', 'No'
  );
  if (confirm !== 'Yes') return;

  outputChannel.show();
  outputChannel.appendLine('Applying updates...');

  applyUpdates(false, {
    onLog: msg => outputChannel.appendLine(msg),
    onRestarting: msg => {
      outputChannel.appendLine(msg);
      showInfo('Board is restarting...');
    },
    onError: (code, msg) => showError(`Update error: ${msg}`)
  });
}

async function cmdSetBoardName() {
  if (!isConnected()) return showError('Not connected');

  const current = await getName();
  const name = await vscode.window.showInputBox({
    prompt: 'Board name',
    value: current
  });
  if (!name) return;

  try {
    await setName(name);
    showInfo('Board name set');
  } catch (err) {
    showError('Failed to set board name', err);
  }
}

async function cmdSetKeyboard() {
  if (!isConnected()) return showError('Not connected');

  const keyboards = await listKeyboards();
  if (keyboards.length === 0) {
    return showWarning('No keyboard layouts available');
  }

  const pick = await vscode.window.showQuickPick(
    keyboards.map(k => ({ label: k.name, id: k.id })),
    { placeHolder: 'Select keyboard layout' }
  );
  if (!pick) return;

  try {
    await setKeyboard(pick.id);
    showInfo('Keyboard layout set');
  } catch (err) {
    showError('Failed to set keyboard layout', err);
  }
}

let resourcesChannel: vscode.OutputChannel | null = null;

function cmdShowResources() {
  if (!isConnected()) return showError('Not connected');

  if (!resourcesChannel) {
    resourcesChannel = vscode.window.createOutputChannel('Arduino Q - Resources');
  }
  resourcesChannel.show();
  resourcesChannel.appendLine('--- System Resources ---');

  streamResources(event => {
    const ts = new Date().toISOString().substring(11, 19);
    switch (event.type) {
      case 'cpu':
        resourcesChannel?.appendLine(`[${ts}] CPU: ${(event.data.used_percent * 100).toFixed(1)}%`);
        break;
      case 'mem':
        resourcesChannel?.appendLine(`[${ts}] Memory: ${event.data.used}/${event.data.total} MB`);
        break;
      case 'disk':
        resourcesChannel?.appendLine(`[${ts}] Disk ${event.data.path}: ${event.data.used}/${event.data.total} MB`);
        break;
    }
  });
}

function cmdOpenTerminal() {
  const board = getSelectedBoard();
  if (!board) return showError('No board selected');

  const port = getBoardPort(board);
  const term = vscode.window.createTerminal({
    name: 'Arduino Q',
    shellPath: 'ssh',
    shellArgs: ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', `root@${port}`]
  });
  term.show();
}
