import { describe, expect, it } from 'vitest';
import { patchGameVersionEnv, readGameVersionEnv } from './gameVersionEnv.js';

describe('gameVersionEnv', () => {
  it('reads existing game version values', () => {
    const result = readGameVersionEnv('A=1\nGAME_VERSION_PATH=/srv/game\nGAME_VERSION_SUB_PATH=server\n');

    expect(result).toEqual({ gameVersionPath: '/srv/game', gameVersionSubPath: 'server' });
  });

  it('patches only game version keys and preserves other lines', () => {
    const result = patchGameVersionEnv('A=1\nGAME_VERSION_PATH=/old\nB=2\n', {
      gameVersionPath: '/new',
      gameVersionSubPath: 'server'
    });

    expect(result).toBe('A=1\nGAME_VERSION_PATH=/new\nB=2\nGAME_VERSION_SUB_PATH=server\n');
  });

  it('removes sub path key when empty', () => {
    const result = patchGameVersionEnv('GAME_VERSION_PATH=/old\nGAME_VERSION_SUB_PATH=server\n', {
      gameVersionPath: '/new',
      gameVersionSubPath: ''
    });

    expect(result).toBe('GAME_VERSION_PATH=/new\n');
  });
});
