import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { VersionRepository } from '../repositories/versionRepository.js';
import { VersionService } from '../services/versionService.js';
import { VersionController } from '../controllers/versionController.js';
import { ValidationError } from '../utils/errors.js';
import { normalizeVersionName, DuplicateVersionError } from '../versions/versionRegistry.js';

const selectVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
  subPath: z.string().optional()
});

const cloneVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
  url: z.string().url(),
  branch: z.string().trim().min(1).default('main')
});

const renameVersionSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/).optional()
}).refine((value) => value.name !== undefined, 'Tên phiên bản mới là bắt buộc');

const nameParamsSchema = z.object({
  name: z.string()
});

export async function registerVersionRoutes(app: FastifyInstance) {
  const projectRoot = app.deps.config.projectRoot;
  const versionRepository = new VersionRepository(projectRoot);
  const versionService = new VersionService(versionRepository, app.deps.runCompose);
  const versionController = new VersionController(versionService);

  // Tạo thư mục versions nếu chưa có
  const versionsDir = versionRepository.getVersionsDir();
  fs.mkdirSync(versionsDir, { recursive: true });
  try {
    fs.chmodSync(versionsDir, 0o777);
  } catch {
    void 0;
  }
  try {
    fs.chownSync(versionsDir, 1000, 1000);
  } catch {
    void 0;
  }

  app.get('/api/versions', (req, reply) => versionController.listVersions(req, reply));

  app.post(
    '/api/versions/select',
    {
      preHandler: validate({ body: selectVersionSchema })
    },
    (req, reply) => versionController.selectVersion(req as any, reply)
  );

  app.patch(
    '/api/versions/:name',
    {
      preHandler: validate({ params: nameParamsSchema, body: renameVersionSchema })
    },
    (req, reply) => versionController.renameVersion(req as any, reply)
  );

  app.get('/api/versions/clone/stream', (request, reply) => {
    const querySchema = z.object({
      name: z.string().regex(/^[A-Za-z0-9_-]{1,10}$/),
      url: z.string().url(),
      branch: z.string().trim().min(1).default('main')
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ');
    }

    const { name, url, branch } = parsed.data;
    const targetName = normalizeVersionName(name);
    const versionsDir = versionRepository.getVersionsDir();
    const targetDir = path.join(versionsDir, targetName);

    const registry = versionRepository.getRegistry();
    const existing = registry.versions.find((v) => v.name === targetName);
    if (existing || fs.existsSync(targetDir)) {
      throw new DuplicateVersionError(targetName);
    }

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

    writeLog(`[Hệ thống] Bắt đầu tải phiên bản ${targetName} từ GitHub...\n`);
    writeLog(`[Hệ thống] Git clone URL: ${url} (nhánh: ${branch})\n`);

    const child = spawn('git', ['clone', '--depth', '1', '-b', branch, url, targetDir]);
    let closed = false;

    child.stdout.on('data', writeLog);
    child.stderr.on('data', writeLog);

    child.on('error', (error: Error) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify(error.message)}\n\n`);
        reply.raw.end();
      }
    });

    child.on('close', (code) => {
      closed = true;
      if (code === 0) {
        try {
          writeLog(`[Hệ thống] Tải về thành công! Đang thiết lập quyền cho thư mục...\n`);
          versionRepository.applyFolderPermissions(targetDir);
          const hasServerDir = fs.existsSync(path.join(targetDir, 'server'));
          versionRepository.create({
            name: targetName,
            source: 'clone',
            serverSubPath: hasServerDir ? 'server' : '',
            allowExistingDirectory: true
          });
          writeLog(`[Hệ thống] Cài đặt phiên bản mới thành công!\n`);
          if (!reply.raw.destroyed) {
            reply.raw.write(`event: close\ndata: ${JSON.stringify({ exitCode: 0 })}\n\n`);
          }
        } catch (err) {
          if (fs.existsSync(targetDir)) {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
          if (!reply.raw.destroyed) {
            reply.raw.write(`event: error\ndata: ${JSON.stringify(err instanceof Error ? err.message : 'Thiết lập phiên bản thất bại')}\n\n`);
          }
        } finally {
          if (!reply.raw.destroyed) {
            reply.raw.end();
          }
        }
      } else {
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        if (!reply.raw.destroyed) {
          reply.raw.write(`event: error\ndata: ${JSON.stringify('Git clone failed')}\n\n`);
          reply.raw.end();
        }
      }
    });

    request.raw.on('close', () => {
      if (!closed) {
        child.kill('SIGTERM');
      }
    });
  });

  app.post(
    '/api/versions/clone',
    {
      preHandler: validate({ body: cloneVersionSchema })
    },
    (req, reply) => versionController.cloneVersion(req as any, reply)
  );

  app.post('/api/versions/upload', (req, reply) => versionController.uploadVersion(req as any, reply));

  app.delete(
    '/api/versions/:name',
    {
      preHandler: validate({ params: nameParamsSchema })
    },
    (req, reply) => versionController.deleteVersion(req as any, reply)
  );

  app.get(
    '/api/versions/:name/browse',
    {
      preHandler: validate({ params: nameParamsSchema })
    },
    (req, reply) => versionController.browseVersion(req as any, reply)
  );
}
