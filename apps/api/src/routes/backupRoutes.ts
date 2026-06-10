import { readdirSync, statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../api/envelope.js';
import { assertBackupFile } from '../backups/backupPaths.js';
import { backupJobStore } from '../backups/backupJobs.js';
import { backupMssql, restoreMssql } from '../backups/mssqlBackup.js';
import { backupMysql, restoreMysql } from '../backups/mysqlBackup.js';

const restoreSchema = z.object({ filename: z.string().min(1) });

export async function registerBackupRoutes(app: FastifyInstance) {
  app.get('/api/backups', async () =>
    ok({
      mysql: listFiles(app.deps.config.mysqlBackupDir),
      mssql: listFiles(app.deps.config.mssqlBackupDir)
    })
  );

  app.get('/api/jobs', async () => ok(backupJobStore.listJobs()));

  app.post('/api/backups/mysql', async () => ok(await runJob('mysql', () => backupMysql(app.deps))));
  app.post('/api/backups/mssql', async () => ok(await runJob('mssql', () => backupMssql(app.deps))));
  app.post('/api/backups/all', async () =>
    ok({
      mysql: await runJob('mysql', () => backupMysql(app.deps)),
      mssql: await runJob('mssql', () => backupMssql(app.deps))
    })
  );

  app.post('/api/restores/mysql', async (request) => {
    const { filename } = restoreSchema.parse(request.body);
    assertBackupFile(app.deps.config.mysqlBackupDir, filename);
    return ok(await runJob('restore-mysql', () => restoreMysql(app.deps, filename)));
  });

  app.post('/api/restores/mssql', async (request) => {
    const { filename } = restoreSchema.parse(request.body);
    assertBackupFile(app.deps.config.mssqlBackupDir, filename);
    return ok(await runJob('restore-mssql', () => restoreMssql(app.deps, filename)));
  });
}

async function runJob<T>(kind: string, action: () => Promise<T>) {
  const job = backupJobStore.startJob(kind);
  try {
    const result = await action();
    backupJobStore.finishJob(job.id, 'succeeded');
    return { ...result, jobId: job.id };
  } catch (error) {
    backupJobStore.finishJob(job.id, 'failed', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

function listFiles(directory: string) {
  try {
    return readdirSync(directory).map((filename) => {
      const stat = statSync(`${directory}/${filename}`);
      return { filename, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    });
  } catch {
    return [];
  }
}
