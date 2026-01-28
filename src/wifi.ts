import { exec } from 'child_process';
import { getSelectedBoard, getBoardPort } from './board';
import { log } from './utils';

export interface WifiNetwork {
  ssid: string;
  signal?: number;
  secure?: boolean;
}

export interface WifiStatus {
  connected: boolean;
  ssid?: string;
  ip?: string;
}

function sshExec(cmd: string): Promise<string> {
  const board = getSelectedBoard();
  if (!board) throw new Error('No board selected');
  const addr = getBoardPort(board);

  return new Promise((resolve, reject) => {
    exec(`ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@${addr} "${cmd}"`,
      { timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
  });
}

export async function listSsids(): Promise<WifiNetwork[]> {
  try {
    const out = await sshExec('iwlist wlan0 scan 2>/dev/null | grep ESSID');
    const lines = out.trim().split('\n');
    const networks: WifiNetwork[] = [];

    for (const line of lines) {
      const match = line.match(/ESSID:"(.+?)"/);
      if (match && match[1]) {
        networks.push({ ssid: match[1] });
      }
    }

    return networks;
  } catch (err) {
    log('error', `Failed to scan wifi: ${err}`);
    return [];
  }
}

export async function getStatus(): Promise<WifiStatus> {
  try {
    const out = await sshExec('iwgetid -r 2>/dev/null');
    const ssid = out.trim();

    if (!ssid) {
      return { connected: false };
    }

    const ipOut = await sshExec('hostname -I 2>/dev/null');
    const ip = ipOut.trim().split(' ')[0];

    return { connected: true, ssid, ip };
  } catch {
    return { connected: false };
  }
}

export async function connect(ssid: string, password: string): Promise<boolean> {
  try {
    await sshExec(`wpa_passphrase "${ssid}" "${password}" > /etc/wpa_supplicant/wpa_supplicant.conf`);
    await sshExec('wpa_cli -i wlan0 reconfigure');
    await new Promise(r => setTimeout(r, 5000));
    const status = await getStatus();
    return status.connected && status.ssid === ssid;
  } catch (err) {
    log('error', `Failed to connect to wifi: ${err}`);
    return false;
  }
}

export async function getInternet(): Promise<boolean> {
  try {
    const out = await sshExec('ping -c 1 -W 2 8.8.8.8 2>/dev/null && echo OK');
    return out.includes('OK');
  } catch {
    return false;
  }
}
