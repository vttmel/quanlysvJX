import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiService from './base/apiService';
import { versionService } from './versionService';

vi.mock('./base/apiService', () => ({
  default: {
    fetchData: vi.fn().mockResolvedValue({ data: { name: 'mel' } }),
  },
}));

describe('versionService', () => {
  beforeEach(() => {
    vi.mocked(ApiService.fetchData).mockClear();
  });

  it('uses a longer timeout for cloning game versions from GitHub', async () => {
    await versionService.cloneVersion({
      name: 'mel',
      url: 'https://github.com/example/game-version',
      branch: 'main',
    });

    expect(ApiService.fetchData).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/versions/clone',
        method: 'POST',
        timeout: 10 * 60 * 1000,
      })
    );
  });
});
