import path from 'node:path';

export type ManagerConfig = {
  projectRoot: string;
  mysqlBackupDir: string;
  mssqlBackupDir: string;
  backupSchedule: string;
  backupRetentionDays: number;
};

export function loadConfig(env = process.env): ManagerConfig {
  const projectRoot = path.resolve(env.MANAGER_PROJECT_ROOT ?? process.cwd());

  return {
    projectRoot,
    mysqlBackupDir: path.resolve(projectRoot, env.MYSQL_BACKUP_DIR ?? 'database/backups/mysql'),
    mssqlBackupDir: path.resolve(projectRoot, env.MSSQL_BACKUP_DIR ?? 'database/mssql/data/database_backups'),
    backupSchedule: env.BACKUP_SCHEDULE ?? '0 3 * * *',
    backupRetentionDays: Number(env.BACKUP_RETENTION_DAYS ?? '14')
  };
}
