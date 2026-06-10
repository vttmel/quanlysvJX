import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../api/envelope.js';

const saveEnvSchema = z.object({
  content: z.string()
});

export async function registerEnvRoutes(app: FastifyInstance) {
  const envFilePath = path.join(app.deps.config.projectRoot, '.env');

  app.get('/api/env', async () => {
    try {
      if (!fs.existsSync(envFilePath)) {
        return ok({ content: '' });
      }
      const content = fs.readFileSync(envFilePath, 'utf8');
      return ok({ content });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot read .env file');
    }
  });

  app.post('/api/env', async (request) => {
    const { content } = saveEnvSchema.parse(request.body);
    try {
      fs.writeFileSync(envFilePath, content, 'utf8');
      return ok({ message: 'Env configuration saved successfully' });
    } catch (error) {
      throw app.httpErrors.internalServerError(error instanceof Error ? error.message : 'Cannot write .env file');
    }
  });
}
