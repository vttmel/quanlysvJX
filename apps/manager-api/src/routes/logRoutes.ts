import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { CommandError } from '../api/errors.js';
import { formatSseLogEvent, normalizeStreamTail, normalizeTail } from '../services/logStream.js';
import { assertServiceName } from '../services/serviceAllowlist.js';

export async function registerLogRoutes(app: FastifyInstance) {
  app.get('/api/services/:name/logs', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    const tail = normalizeTail((request.query as { tail?: string }).tail);
    const result = await app.deps.runCompose(['logs', '--no-color', '--tail', String(tail), name]);

    if (result.exitCode !== 0) {
      throw new CommandError(`Unable to read logs for ${name}`);
    }

    return ok({ service: name, tail, logs: result.stdout });
  });

  app.get('/api/services/:name/logs/stream', (request, reply) => {
    const name = assertServiceName((request.params as { name: string }).name);
    const tail = normalizeStreamTail((request.query as { tail?: string }).tail);
    const stream = app.deps.streamCompose(['logs', '--no-color', '--tail', String(tail), '--follow', name]);
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const writeLog = (chunk: unknown) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(formatSseLogEvent(String(chunk)));
      }
    };

    stream.stdout.on('data', writeLog);
    stream.stderr.on('data', writeLog);
    stream.on('error', (error: Error) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(formatSseLogEvent(error.message, 'error'));
        reply.raw.end();
      }
    });
    stream.on('close', () => {
      closed = true;
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    });

    request.raw.on('close', () => {
      if (!closed) {
        stream.kill('SIGTERM');
      }
    });
  });
}
