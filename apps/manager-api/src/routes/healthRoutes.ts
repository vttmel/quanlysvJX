import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ success: true, data: { status: 'ok' }, error: null }));
}
