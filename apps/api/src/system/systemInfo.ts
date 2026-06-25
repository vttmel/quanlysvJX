import { execFileSync, execSync } from 'node:child_process';
import os, { type NetworkInterfaceInfo } from 'node:os';
import { z } from 'zod';
import { readEnvMap, updateEnvKeys } from '../env/envFile.js';

export const gameNetworkPayloadSchema = z.object({
  jxIp: z.string(),
  mysqlIp: z.string(),
  paysysIp: z.string(),
  mssqlIp: z.string(),
  modGame: z.boolean().optional()
});

export type GameNetworkConfig = z.infer<typeof gameNetworkPayloadSchema>;

export type CoreServiceState = {
  name: string;
  state: string;
};

export type SystemInfo = {
  serverTime: string;
  timezone: string;
  ipChoices: string[];
  serverIpChoices: ServerIpChoice[];
  serverIp: string;
  mysqlIp: string;
  mssqlIp: string;
  gameNetwork: GameNetworkConfig;
  rawJxIp: string | null;
  coreServicesRunning: boolean;
  runningCoreServices: string[];
  cpuUsage: number;
  ramUsage: number;
  ramUsed: number;
  ramTotal: number;
  diskUsage: number;
  diskUsed: number;
  diskTotal: number;
};

export type HostIpCommandResult = {
  stdout: string;
  exitCode: number;
};

export type ServerIpChoice = {
  address: string;
  interfaceName: string;
  kind: 'host' | 'vpn';
};

export type ServerIpChoiceOptions = {
  interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>;
  commandRunner?: () => HostIpCommandResult;
};

const coreServiceNames = new Set(['jxserver', 's3relay', 'bishop', 'goddess']);
const loopbackIp = '127.0.0.1';
const virtualInterfacePattern = /^(docker\d*|br-.+|veth.+|virbr\d*|lo)$/;
const vpnInterfacePattern = /^(tailscale\d*|zt.+|zerotier.+|wg\d*|tun\d*|tap\d*|ppp\d*)$/i;
const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function getServerIpChoices(options: ServerIpChoiceOptions = {}) {
  return getServerIpChoiceDetails(options).map((choice) => choice.address);
}

export function getServerIpChoiceDetails(options: ServerIpChoiceOptions = {}) {
  const hostNamespaceIps = getHostNamespaceIpChoices(options.commandRunner ?? runHostNamespaceIpCommand);
  if (hostNamespaceIps.length > 0) {
    return hostNamespaceIps;
  }

  const detectedInterfaces = options.interfaces ?? safeNetworkInterfaces();
  return getInterfaceIpChoices(detectedInterfaces);
}

function getInterfaceIpChoices(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>) {
  const choices = new Map<string, ServerIpChoice>();
  for (const [name, entries] of Object.entries(interfaces)) {
    if (isVirtualInterface(name)) {
      continue;
    }
    for (const entry of entries ?? []) {
      if (isIpv4Interface(entry)) {
        choices.set(entry.address, buildServerIpChoice(name, entry.address));
      }
    }
  }
  return sortServerIpChoices([...choices.values()]);
}

function getHostNamespaceIpChoices(commandRunner: () => HostIpCommandResult) {
  try {
    const result = commandRunner();
    if (result.exitCode !== 0) {
      return [];
    }
    return parseIpAddrOutput(result.stdout);
  } catch {
    return [];
  }
}

function runHostNamespaceIpCommand(): HostIpCommandResult {
  const stdout = execFileSync(
    'nsenter',
    ['--net=/host/proc/1/ns/net', 'ip', '-o', '-4', 'addr', 'show', 'scope', 'global'],
    { encoding: 'utf8' }
  );
  return { stdout, exitCode: 0 };
}

function parseIpAddrOutput(stdout: string) {
  const choices = new Map<string, ServerIpChoice>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\d+:\s+([^\s]+)\s+inet\s+([^/\s]+)/);
    if (!match) {
      continue;
    }
    const [, interfaceName, address] = match;
    if (!interfaceName || !address || isVirtualInterface(interfaceName) || !isIpv4(address)) {
      continue;
    }
    choices.set(address, buildServerIpChoice(interfaceName, address));
  }
  return sortServerIpChoices([...choices.values()]);
}

function safeNetworkInterfaces() {
  try {
    return os.networkInterfaces();
  } catch {
    return {};
  }
}

export function normalizeGameNetworkConfig(
  env: Record<string, string | undefined>,
  ipChoices: string[]
): GameNetworkConfig {
  return {
    jxIp: normalizeHostIp(env.JX_IP, ipChoices),
    mysqlIp: normalizeIpv4(env.JX_MYSQL_IP),
    paysysIp: normalizeIpv4(env.JX_PAYSYS_IP),
    mssqlIp: normalizeIpv4(env.JX_MSSQL_IP),
    modGame: env.JX_MOD_GAME === 'true'
  };
}

export function validateGameNetworkPayload(payload: unknown, ipChoices: string[]) {
  const parsed = gameNetworkPayloadSchema.parse(payload);
  if (!ipChoices.includes(parsed.jxIp)) {
    throw new Error('IP không hợp lệ. Vui lòng chọn IP thật của máy chủ.');
  }
  for (const value of [parsed.mysqlIp, parsed.paysysIp, parsed.mssqlIp]) {
    assertIpv4(value);
  }
  return parsed;
}

export function saveGameNetworkConfig(envFilePath: string, config: GameNetworkConfig) {
  updateEnvKeys(envFilePath, {
    JX_IP: config.jxIp,
    JX_MYSQL_IP: config.mysqlIp,
    JX_PAYSYS_IP: config.paysysIp,
    JX_MSSQL_IP: config.mssqlIp,
    JX_MOD_GAME: config.modGame ? 'true' : 'false'
  });
}

let lastCpuTicks = getCpuTicks();

function getCpuTicks() {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  const total = user + nice + sys + idle + irq;
  return { total, idle };
}

export function getCpuUsage() {
  const current = getCpuTicks();
  const idleDifference = current.idle - lastCpuTicks.idle;
  const totalDifference = current.total - lastCpuTicks.total;
  lastCpuTicks = current;
  if (totalDifference === 0) return 0;
  return Math.round((1 - idleDifference / totalDifference) * 1000) / 10;
}

export function getRamDetails() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const totalGB = Math.round((totalMem / (1024 * 1024 * 1024)) * 10) / 10;
  const usedGB = Math.round((usedMem / (1024 * 1024 * 1024)) * 10) / 10;
  const percent = totalMem === 0 ? 0 : Math.round((usedMem / totalMem) * 1000) / 10;
  return {
    used: usedGB,
    total: totalGB,
    percent
  };
}

export function getDiskDetails() {
  try {
    const stdout = execSync('df -P .', { encoding: 'utf8' });
    const lines = stdout.trim().split('\n');
    const line = lines[1];
    if (line) {
      const parts = line.split(/\s+/);
      const totalKB = parseInt(parts[1] || '0', 10);
      const usedKB = parseInt(parts[2] || '0', 10);
      const percentStr = parts[4]?.replace('%', '');
      
      const totalGB = Math.round((totalKB / (1024 * 1024)) * 10) / 10;
      const usedGB = Math.round((usedKB / (1024 * 1024)) * 10) / 10;
      const percent = percentStr ? parseInt(percentStr, 10) : 0;

      return {
        used: usedGB,
        total: totalGB,
        percent
      };
    }
  } catch {
    // Fallback
  }
  return { used: 0, total: 0, percent: 0 };
}

export function buildSystemInfo(options: {
  envFilePath: string;
  ipChoices?: string[];
  serverIpChoices?: ServerIpChoice[];
  coreServices?: CoreServiceState[];
  now?: Date;
  timezone?: string;
}): SystemInfo {
  const serverIpChoices = options.serverIpChoices ?? (options.ipChoices
    ? options.ipChoices.map((address) => buildServerIpChoice('host', address))
    : getServerIpChoiceDetails());
  const ipChoices = serverIpChoices.map((choice) => choice.address);
  const env = readEnvMap(options.envFilePath);
  const gameNetwork = normalizeGameNetworkConfig(env, ipChoices);
  const runningCoreServices = (options.coreServices ?? [])
    .filter((service) => coreServiceNames.has(service.name) && ['running', 'starting'].includes(service.state))
    .map((service) => service.name);

  const ram = getRamDetails();
  const disk = getDiskDetails();

  return {
    serverTime: (options.now ?? new Date()).toISOString(),
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ipChoices,
    serverIpChoices,
    serverIp: gameNetwork.jxIp,
    mysqlIp: gameNetwork.mysqlIp,
    mssqlIp: gameNetwork.mssqlIp,
    gameNetwork,
    rawJxIp: env.JX_IP ?? null,
    coreServicesRunning: runningCoreServices.length > 0,
    runningCoreServices,
    cpuUsage: getCpuUsage(),
    ramUsage: ram.percent,
    ramUsed: ram.used,
    ramTotal: ram.total,
    diskUsage: disk.percent,
    diskUsed: disk.used,
    diskTotal: disk.total
  };
}

function normalizeHostIp(value: string | undefined, ipChoices: string[]) {
  if (value && ipChoices.includes(value)) {
    return value;
  }
  return ipChoices[0] ?? '';
}

function normalizeIpv4(value: string | undefined) {
  if (value && isIpv4(value)) {
    return value;
  }
  return loopbackIp;
}

function assertIpv4(value: string) {
  if (!isIpv4(value)) {
    throw new Error('IP không hợp lệ. Vui lòng nhập đúng IPv4.');
  }
}

function isIpv4(value: string) {
  return ipv4Pattern.test(value);
}

function isVirtualInterface(name: string) {
  return virtualInterfacePattern.test(name);
}

function isVpnInterface(name: string) {
  return vpnInterfacePattern.test(name);
}

function buildServerIpChoice(interfaceName: string, address: string): ServerIpChoice {
  return {
    address,
    interfaceName,
    kind: isVpnInterface(interfaceName) ? 'vpn' : 'host'
  };
}

function sortServerIpChoices(choices: ServerIpChoice[]) {
  return [...choices].sort((left, right) => {
    const kindCompare = getIpKindRank(left.kind) - getIpKindRank(right.kind);
    if (kindCompare !== 0) {
      return kindCompare;
    }
    const interfaceCompare = left.interfaceName.localeCompare(right.interfaceName, undefined, { numeric: true });
    if (interfaceCompare !== 0) {
      return interfaceCompare;
    }
    return left.address.localeCompare(right.address, undefined, { numeric: true });
  });
}

function getIpKindRank(kind: ServerIpChoice['kind']) {
  return kind === 'host' ? 0 : 1;
}

function isIpv4Interface(entry: NetworkInterfaceInfo) {
  return entry.family === 'IPv4' && !entry.internal && isIpv4(entry.address);
}
