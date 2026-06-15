import Fastify from 'fastify';
import path from 'node:path';
import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import { getErrorHandler } from './middleware/errorHandler.js';
import { startScheduledBackupScheduler } from './scheduledBackups/scheduledBackupScheduler.js';
import { loadConfig, type ManagerConfig } from './config.js';
import { createGameAccountService, type GameAccountService } from './gameAccounts/gameAccountService.js';
import { createMssqlGameAccountRepository } from './gameAccounts/mssqlGameAccountRepository.js';
import { registerBackupRoutes } from './routes/backupRoutes.js';
import { registerScheduledBackupRoutes } from './routes/scheduledBackupRoutes.js';
import { registerGameAccountRoutes } from './routes/gameAccountRoutes.js';
import { registerHealthRoutes } from './routes/healthRoutes.js';
import { registerLogRoutes } from './routes/logRoutes.js';
import { registerServiceRoutes } from './routes/serviceRoutes.js';
import { registerEnvRoutes } from './routes/envRoutes.js';
import { registerSystemRoutes } from './routes/systemRoutes.js';
import { registerVersionRoutes } from './routes/versionRoutes.js';
import {
  runDocker,
  runDockerCompose,
  runDockerComposeStream,
  type CommandResult,
  type ComposeStream
} from './services/composeRunner.js';

export type AppDeps = {
  config: ManagerConfig;
  runCompose: (args: readonly string[], options?: { stdin?: string | Buffer }) => Promise<CommandResult>;
  runDocker: (args: readonly string[], options?: { stdin?: string | Buffer }) => Promise<CommandResult>;
  streamCompose: (args: readonly string[]) => ComposeStream;
  gameAccounts: GameAccountService;
};

import { autoUpdateEnvIp } from './env/envFile.js';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';

function ensureConfigFiles(projectRoot: string) {
  const configsToCopy = [
    {
      example: path.join(projectRoot, '.env.example'),
      target: path.join(projectRoot, '.env')
    },
    {
      example: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/bishop.cfg.example'),
      target: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/bishop.cfg')
    },
    {
      example: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/goddess.cfg.example'),
      target: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/goddess.cfg')
    },
    {
      example: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/hostset.ini.example'),
      target: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/hostset.ini')
    },
    {
      example: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/relay_config.ini.example'),
      target: path.join(projectRoot, 'apps/jx-services/mount/config/gateway/relay_config.ini')
    },
    {
      example: path.join(projectRoot, 'apps/jx-services/mount/config/gs1/servercf0.ini.example'),
      target: path.join(projectRoot, 'apps/jx-services/mount/config/gs1/servercf0.ini')
    },
    {
      example: path.join(projectRoot, 'apps/jx-services/mount/config/paysys/database.ini.example'),
      target: path.join(projectRoot, 'apps/jx-services/mount/config/paysys/database.ini')
    }
  ];

  for (const config of configsToCopy) {
    if (!existsSync(config.target) && existsSync(config.example)) {
      mkdirSync(path.dirname(config.target), { recursive: true });
      copyFileSync(config.example, config.target);
    }
  }
}

export async function buildApp(overrides: Partial<AppDeps> = {}) {
  // Tự động phát hiện và ghi đè IP host vào .env nếu đang là auto
  let projectRoot = process.env.MANAGER_PROJECT_ROOT || '/workspace';
  if (process.env.VITEST || (!existsSync(projectRoot) && projectRoot === '/workspace')) {
    const cwd = process.cwd();
    if (cwd.includes('apps/api')) {
      projectRoot = path.resolve(cwd, '../..');
    } else {
      projectRoot = cwd;
    }
  }
  
  ensureConfigFiles(projectRoot);

  const envFilePath = path.join(projectRoot, '.env');
  const updatedIp = autoUpdateEnvIp(envFilePath);
  if (updatedIp) {
    process.env.JX_IP = updatedIp;
  }

  const config = overrides.config ?? loadConfig();
  const deps: AppDeps = {
    config,
    runCompose:
      overrides.runCompose ??
      ((args, options) => runDockerCompose(args, config.projectRoot, options, { projectRoot: config.hostProjectRoot ?? config.projectRoot })),
    runDocker: overrides.runDocker ?? ((args, options) => runDocker(args, config.projectRoot, options)),
    streamCompose:
      overrides.streamCompose ??
      ((args) => runDockerComposeStream(args, config.projectRoot, { projectRoot: config.hostProjectRoot ?? config.projectRoot })),
    gameAccounts: overrides.gameAccounts ?? createGameAccountService(createMssqlGameAccountRepository(config.mssql))
  };

  const app = Fastify({ logger: true });
  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024 // 2GB
    }
  });
  app.decorate('deps', deps);

  app.setErrorHandler(getErrorHandler(app));

  await registerHealthRoutes(app);
  await registerServiceRoutes(app);
  await registerLogRoutes(app);
  await registerBackupRoutes(app);
  await registerScheduledBackupRoutes(app);
  await registerGameAccountRoutes(app);
  await registerEnvRoutes(app);
  await registerSystemRoutes(app);
  await registerVersionRoutes(app);

  if (config.schedulerEnabled) {
    app.log.info('Backup scheduler enabled');
    const scheduledTask = startScheduledBackupScheduler(deps, app.log);
    app.addHook('onClose', () => {
      scheduledTask.stop();
    });
  } else {
    app.log.info('Backup scheduler disabled');
  }

  return app;
}


declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
