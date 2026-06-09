import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { registerHealthRoutes } from './routes/healthRoutes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(sensible);
  await registerHealthRoutes(app);
  return app;
}
