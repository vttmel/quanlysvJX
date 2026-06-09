import { mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { CommandError } from '../api/errors.js';
import type { AppDeps } from '../app.js';
import { assertBackupFile, buildBackupFilename } from './backupPaths.js';

export async function backupMysql(deps: AppDeps) {
  mkdirSync(deps.config.mysqlBackupDir, { recursive: true });
  const filename = buildBackupFilename('mysql');
  const hostPath = path.join(deps.config.mysqlBackupDir, filename);
  const result = await deps.runCompose([
    'exec',
    '-T',
    'jxmysql',
    'sh',
    '-lc',
    'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --all-databases'
  ]);

  if (result.exitCode !== 0) {
    throw new CommandError('MySQL backup failed');
  }

  await writeFile(hostPath, gzipSync(Buffer.from(result.stdout, 'utf8')));
  return { kind: 'mysql' as const, filename, path: hostPath };
}

export async function restoreMysql(deps: AppDeps, filename: string) {
  const hostPath = assertBackupFile(deps.config.mysqlBackupDir, filename);
  const backupBase64 = readFileSync(hostPath).toString('base64');
  const restoreScript = `base64 -d <<'MANAGER_BACKUP' | gzip -dc | mysql -uroot -p"$MYSQL_ROOT_PASSWORD"\n${backupBase64}\nMANAGER_BACKUP`;
  const result = await deps.runCompose(['exec', '-T', 'jxmysql', 'sh', '-lc', restoreScript]);

  if (result.exitCode !== 0) {
    throw new CommandError('MySQL restore failed');
  }

  return { kind: 'mysql' as const, filename };
}
