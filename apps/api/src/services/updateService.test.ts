import { describe, expect, it, vi } from 'vitest';
import { UpdateService } from './updateService.js';

describe('UpdateService', () => {
  it('reports update available when latest release tag differs from current version', async () => {
    const service = new UpdateService({
      projectRoot: '/workspace',
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: 'v1.1.0',
          htmlUrl: 'https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0',
          body: 'Release notes'
        })
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
        stream: vi.fn()
      },
      now: () => new Date('2026-06-24T10:00:00.000Z')
    });

    const status = await service.checkForUpdates();

    expect(status).toMatchObject({
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      latestVersion: 'v1.1.0',
      latestTag: 'v1.1.0',
      releaseUrl: 'https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0',
      releaseNotes: 'Release notes',
      hasUpdate: true,
      repoDirty: false,
      checkedAt: '2026-06-24T10:00:00.000Z'
    });
  });

  it('blocks update when repository has uncommitted changes', async () => {
    const commandRunner = {
      run: vi.fn().mockResolvedValue({ code: 0, stdout: ' M apps/api/src/app.ts\n', stderr: '' }),
      stream: vi.fn()
    };
    const service = new UpdateService({
      projectRoot: '/workspace',
      currentVersion: 'v1.0.0',
      currentCommit: 'abc1234',
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({ tagName: 'v1.1.0', htmlUrl: 'url', body: '' })
      },
      commandRunner,
      now: () => new Date('2026-06-24T10:00:00.000Z')
    });

    await expect(service.runUpdate()).rejects.toThrow('Repository has uncommitted changes');
    expect(commandRunner.stream).not.toHaveBeenCalled();
  });
});
