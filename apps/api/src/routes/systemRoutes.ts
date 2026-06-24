import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SystemRepository } from '../repositories/systemRepository.js';
import { SystemService } from '../services/systemService.js';
import { SystemController } from '../controllers/systemController.js';

import { success } from '../utils/response.js';

export async function registerSystemRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, 'apps/jx-services/.env');
  const systemRepository = new SystemRepository({ runCompose: app.deps.runCompose });
  const systemService = new SystemService(systemRepository, envFilePath);
  const systemController = new SystemController(systemService);

  app.get('/api/system/info', (req: FastifyRequest, reply: FastifyReply) => systemController.getSystemInfo(req, reply));

  app.put('/api/system/game-network', async (req: FastifyRequest, reply: FastifyReply) => {
    const payload = systemService.saveGameNetwork(req.body);
    const { reloadAppConfig } = await import('../app.js');
    reloadAppConfig(app);
    return reply.send(
      success({
        gameNetwork: payload,
        message: 'Đã lưu cấu hình IP game vào .env. Restart dịch vụ để áp dụng.'
      })
    );
  });
}
