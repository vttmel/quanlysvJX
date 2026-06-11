import os, { type NetworkInterfaceInfo } from 'node:os';
import { z } from 'zod';
import { readEnvMap, updateEnvKeys } from '../env/envFile.js';

export const gameNetworkPayloadSchema = z.object({
  jxIp: z.string(),
  mysqlIp: z.string(),
  paysysIp: z.string(),
  mssqlIp: z.string()
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
  serverIp: string;
  mysqlIp: string;
  mssqlIp: string;
  gameNetwork: GameNetworkConfig;
  coreServicesRunning: boolean;
  runningCoreServices: string[];
};

const fallbackIp = '127.0.0.1';
const coreServiceNames = new Set(['jxserver', 's3relay', 'bishop', 'goddess']);

export function getServerIpChoices(interfaces = os.networkInterfaces()) {
  const ips = new Set<string>([fallbackIp]);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (isIpv4Interface(entry)) {
        ips.add(entry.address);
      }
    }
  }
  return [...ips].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function normalizeGameNetworkConfig(
  env: Record<string, string | undefined>,
  ipChoices: string[]
): GameNetworkConfig {
  return {
    jxIp: normalizeEnvIp(env.JX_IP, ipChoices),
    mysqlIp: normalizeEnvIp(env.JX_MYSQL_IP, ipChoices),
    paysysIp: normalizeEnvIp(env.JX_PAYSYS_IP, ipChoices),
    mssqlIp: normalizeEnvIp(env.JX_MSSQL_IP, ipChoices)
  };
}

export function validateGameNetworkPayload(payload: unknown, ipChoices: string[]) {
  const parsed = gameNetworkPayloadSchema.parse(payload);
  for (const value of Object.values(parsed)) {
    if (!ipChoices.includes(value)) {
      throw new Error('IP không hợp lệ. Vui lòng chọn IP từ danh sách server.');
    }
  }
  return parsed;
}

export function saveGameNetworkConfig(envFilePath: string, config: GameNetworkConfig) {
  updateEnvKeys(envFilePath, {
    JX_IP: config.jxIp,
    JX_MYSQL_IP: config.mysqlIp,
    JX_PAYSYS_IP: config.paysysIp,
    JX_MSSQL_IP: config.mssqlIp
  });
}

export function buildSystemInfo(options: {
  envFilePath: string;
  ipChoices?: string[];
  coreServices?: CoreServiceState[];
  now?: Date;
  timezone?: string;
}): SystemInfo {
  const ipChoices = options.ipChoices ?? getServerIpChoices();
  const env = readEnvMap(options.envFilePath);
  const gameNetwork = normalizeGameNetworkConfig(env, ipChoices);
  const runningCoreServices = (options.coreServices ?? [])
    .filter((service) => coreServiceNames.has(service.name) && ['running', 'starting'].includes(service.state))
    .map((service) => service.name);

  return {
    serverTime: (options.now ?? new Date()).toISOString(),
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    ipChoices,
    serverIp: gameNetwork.jxIp,
    mysqlIp: gameNetwork.mysqlIp,
    mssqlIp: gameNetwork.mssqlIp,
    gameNetwork,
    coreServicesRunning: runningCoreServices.length > 0,
    runningCoreServices
  };
}

function normalizeEnvIp(value: string | undefined, ipChoices: string[]) {
  if (value && ipChoices.includes(value)) {
    return value;
  }
  return fallbackIp;
}

function isIpv4Interface(entry: NetworkInterfaceInfo) {
  return entry.family === 'IPv4' && Boolean(entry.address);
}
