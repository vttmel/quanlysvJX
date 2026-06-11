import { describe, expect, it } from 'vitest';
import { buildComposeArgs, buildDockerArgs } from './composeRunner.js';
import { assertServiceName, serviceNames } from './serviceAllowlist.js';

describe('service allowlist', () => {
  it('contains the compose services managed by this app', () => {
    expect(serviceNames).toEqual([
      'jxmysql',
      'jxmssql',
      'paysys',
      's3relayserver',
      'goddess',
      'bishop',
      's3relay',
      'jxserver'
    ]);
  });

  it('rejects service names outside the current compose file', () => {
    expect(() => assertServiceName('$(rm -rf /)')).toThrow('Unsupported service');
  });
});

describe('buildComposeArgs', () => {
  it('builds argument arrays without shell interpolation', () => {
    expect(buildComposeArgs(['ps', '--format', 'json'])).toEqual([
      'compose',
      '--env-file',
      '.env',
      '-f',
      'apps/jx-services/docker-compose.yaml',
      'ps',
      '--format',
      'json'
    ]);
  });
});

describe('buildDockerArgs', () => {
  it('passes docker subcommands without shell interpolation', () => {
    expect(buildDockerArgs(['image', 'inspect', 'paysys'])).toEqual(['image', 'inspect', 'paysys']);
  });
});
