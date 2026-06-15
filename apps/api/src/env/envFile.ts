import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function readEnvFile(envFilePath: string) {
  if (!existsSync(envFilePath)) {
    return '';
  }
  return readFileSync(envFilePath, 'utf8');
}

export function readEnvMap(envFilePath: string) {
  const values: Record<string, string> = {};
  for (const line of readEnvFile(envFilePath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    values[key] = line.slice(separatorIndex + 1).trim();
  }
  return values;
}

export function writeEnvFile(envFilePath: string, content: string) {
  mkdirSync(path.dirname(envFilePath), { recursive: true });
  const normalized = content.endsWith('\n') ? content : `${content}\n`;
  const tempPath = `${envFilePath}.tmp`;
  writeFileSync(tempPath, normalized, 'utf8');
  try {
    renameSync(tempPath, envFilePath);
  } catch (error) {
    // .env is often bind-mounted as a single file (e.g. Docker Desktop on Windows),
    // which puts it on a different filesystem than its sibling .tmp file and makes
    // rename() fail with EXDEV. Fall back to a direct write in that case.
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
      throw error;
    }
    writeFileSync(envFilePath, normalized, 'utf8');
    rmSync(tempPath, { force: true });
  }
  writeFileSync(envFilePath, normalized, 'utf8');
}

export function updateEnvKey(envFilePath: string, key: string, value: string) {
  updateEnvKeys(envFilePath, { [key]: value });
}

export function updateEnvKeys(envFilePath: string, updates: Record<string, string>) {
  const seen = new Set<string>();
  const lines = readEnvFile(envFilePath).split(/\r?\n/);
  const nextLines = lines
    .filter((line, index) => !(index === lines.length - 1 && line === ''))
    .flatMap((line) => {
      const key = getUpdatableKey(line);
      if (!key) {
        return line;
      }
      if (!(key in updates)) {
        return line;
      }
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return `${key}=${updates[key]}`;
    });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  writeEnvFile(envFilePath, nextLines.join('\n'));
}

function getUpdatableKey(line: string) {
  const separatorIndex = line.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }
  const rawKey = line.slice(0, separatorIndex).trim();
  if (rawKey.startsWith('#')) {
    return rawKey.replace(/^#\s*/, '').trim();
  }
  return rawKey;
}
