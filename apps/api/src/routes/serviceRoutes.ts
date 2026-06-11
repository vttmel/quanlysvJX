import type { FastifyInstance } from 'fastify';
import { ok } from '../api/envelope.js';
import { CommandError, ValidationError } from '../api/errors.js';
import { assertServiceName } from '../services/serviceAllowlist.js';
import { parseManagedServiceStatuses } from '../services/serviceStatus.js';
import { readVersionRegistry } from '../versions/versionRegistry.js';
import type { ComposeStream } from '../services/composeRunner.js';

function assertActiveVersion(projectRoot: string) {
  const registry = readVersionRegistry(projectRoot);
  if (!registry.activeVersion) {
    throw new ValidationError('Chưa có phiên bản game nào được kích hoạt. Vui lòng kích hoạt một phiên bản trước.');
  }
}

export async function registerServiceRoutes(app: FastifyInstance) {
  const projectRoot = app.deps.config.projectRoot;

  app.get('/api/services', async () => {
    const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
    if (result.exitCode !== 0) {
      throw new CommandError('Unable to read Docker Compose services');
    }

    return ok(parseManagedServiceStatuses(result.stdout));
  });

  app.post('/api/services/:name/start', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    assertActiveVersion(projectRoot);
    const result = await runAction(app, ['up', '-d', name], `Started ${name}`);
    return ok(result);
  });

  app.get('/api/services/:name/start/stream', (request, reply) => {
    const name = assertServiceName((request.params as { name: string }).name);
    assertActiveVersion(projectRoot);

    // Chạy docker compose up -d --build --no-deps để build và khởi chạy độc lập container được chỉ định,
    // bỏ qua việc build/khởi chạy các phụ thuộc khác (ngăn chặn build kép).
    const args = ['up', '-d', '--build', '--no-deps', name];
    const stream = app.deps.streamCompose(args);
    let closed = false;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    reply.raw.write(':\n\n');

    const writeLog = (chunk: unknown) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`event: log\ndata: ${JSON.stringify(String(chunk))}\n\n`);
      }
    };

    stream.stdout.on('data', writeLog);
    stream.stderr.on('data', writeLog);
    stream.on('error', (error: Error) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify(error.message)}\n\n`);
        reply.raw.end();
      }
    });
    stream.on('close', (code) => {
      closed = true;
      if (!reply.raw.destroyed) {
        if (code === 0) {
          reply.raw.write(`event: log\ndata: ${JSON.stringify(`[Hệ thống] Khởi chạy container ${name} thành công!\n`)}\n\n`);
        }
        reply.raw.write(`event: close\ndata: ${JSON.stringify({ exitCode: code })}\n\n`);
        reply.raw.end();
      }
    });

    request.raw.on('close', () => {
      if (!closed) {
        stream.kill('SIGTERM');
      }
    });
  });

  app.post('/api/services/:name/stop', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    await preHandleStopDependency(app, name);
    return ok(await runAction(app, ['stop', name], `Stopped ${name}`));
  });

  app.post('/api/services/:name/restart', async (request) => {
    const name = assertServiceName((request.params as { name: string }).name);
    assertActiveVersion(projectRoot);
    await preHandleStopDependency(app, name);
    return ok(await runAction(app, ['restart', name], `Restarted ${name}`));
  });
}

async function preHandleStopDependency(app: FastifyInstance, serviceName: string) {
  const result = await app.deps.runCompose(['ps', '--all', '--format', 'json']);
  if (result.exitCode !== 0) {
    throw new CommandError('Unable to read Docker Compose services');
  }
  const services = parseManagedServiceStatuses(result.stdout);

  if (serviceName === 'jxserver') {
    const isS3RelayRunning = services.some(
      (s) => s.name === 's3relay' && (s.state === 'running' || s.state === 'starting')
    );
    if (isS3RelayRunning) {
      // Tự động tắt s3relay chạy ngầm trước
      await runAction(app, ['stop', 's3relay'], 'Auto stopped s3relay');
    }
  }

  if (serviceName === 'jxmysql' || serviceName === 'jxmssql') {
    const areOtherServicesRunning = services.some(
      (s) => s.name !== 'jxmysql' && s.name !== 'jxmssql' && (s.state === 'running' || s.state === 'starting')
    );
    if (areOtherServicesRunning) {
      throw new ValidationError('Cần tắt toàn bộ các dịch vụ JX khác trước khi dừng hoặc khởi động lại Database');
    }
  }
}

async function runAction(app: FastifyInstance, args: readonly string[], message: string) {
  const result = await app.deps.runCompose(args);
  if (result.exitCode !== 0) {
    throw new CommandError(formatActionError(message, result.stderr || result.stdout));
  }

  return { message, stdout: result.stdout, stderr: result.stderr };
}

function formatActionError(message: string, output: string) {
  const detail = output.trim().slice(0, 1000);
  return detail ? `${message} failed: ${detail}` : `${message} failed`;
}
