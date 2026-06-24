import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { GameVersionSettingsController } from '../controllers/gameVersionSettingsController.js';
import { EnvRepository } from '../repositories/envRepository.js';
import { GameVersionSettingsService } from '../services/gameVersionSettingsService.js';
import { validate } from '../middleware/validate.js';
import { success } from '../utils/response.js';

const gameVersionSettingsSchema = z.object({
  gameVersionPath: z.string().min(1, 'Đường dẫn game version không được để trống'),
  gameVersionSubPath: z.string().optional().default('')
});

export async function registerGameVersionSettingsRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, 'apps/jx-services/.env');
  const envRepository = new EnvRepository(envFilePath);
  const service = new GameVersionSettingsService(envRepository);
  const controller = new GameVersionSettingsController(service);

  app.get('/api/game-version-settings', (req: FastifyRequest, reply: FastifyReply) => controller.getSettings(req, reply));
  app.get('/api/game-version-settings/startup-check', (req: FastifyRequest, reply: FastifyReply) => controller.startupCheck(req, reply));
  app.post(
    '/api/game-version-settings/validate',
    { preHandler: validate({ body: gameVersionSettingsSchema }) },
    (req: FastifyRequest, reply: FastifyReply) => controller.validateSettings(req as any, reply)
  );
  app.put(
    '/api/game-version-settings',
    { preHandler: validate({ body: gameVersionSettingsSchema }) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const result = service.saveSettings(req.body as any);
      const { reloadAppConfig } = await import('../app.js');
      reloadAppConfig(app);
      return reply.send(success(result));
    }
  );
}
