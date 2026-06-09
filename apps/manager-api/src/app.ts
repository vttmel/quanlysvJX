import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { fail } from './api/envelope.js';
import { AppError } from './api/errors.js';
import { registerHealthRoutes } from './routes/healthRoutes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(sensible);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(fail(error.message));
      return;
    }

    app.log.error({ err: error }, 'Unhandled manager API error');
    void reply.status(500).send(fail('Unexpected server error'));
  });

  await registerHealthRoutes(app);
  return app;
}
