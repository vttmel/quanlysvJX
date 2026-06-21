import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GameVersionSettingsController } from '../controllers/gameVersionSettingsController.js';
import { EnvRepository } from '../repositories/envRepository.js';
import { GameVersionSettingsService } from '../services/gameVersionSettingsService.js';
import { validate } from '../middleware/validate.js';

const gameVersionSettingsSchema = z.object({
  gameVersionPath: z.string().min(1, 'Đường dẫn game version không được để trống'),
  gameVersionSubPath: z.string().optional().default('')
});

export async function registerGameVersionSettingsRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, 'apps/jx-services/.env');
  const envRepository = new EnvRepository(envFilePath);
  const service = new GameVersionSettingsService(envRepository);
  const controller = new GameVersionSettingsController(service);

  app.get('/api/game-version-settings', (req, reply) => controller.getSettings(req, reply));
  app.get('/api/game-version-settings/startup-check', (req, reply) => controller.startupCheck(req, reply));
  app.post(
    '/api/game-version-settings/validate',
    { preHandler: validate({ body: gameVersionSettingsSchema }) },
    (req, reply) => controller.validateSettings(req as any, reply)
  );
  app.put(
    '/api/game-version-settings',
    { preHandler: validate({ body: gameVersionSettingsSchema }) },
    (req, reply) => controller.saveSettings(req as any, reply)
  );
}
