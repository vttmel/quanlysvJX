import { describe, expect, it } from 'vitest';
import { parseComposePsJson, parseManagedServiceStatuses } from './serviceStatus.js';

describe('parseComposePsJson', () => {
  it('normalizes compose ps json rows', () => {
    const rows = JSON.stringify([
      {
        Service: 'jxmysql',
        Name: 'jxmysql',
        State: 'running',
        Health: 'healthy',
        Image: 'mysql:5.6',
        Publishers: [{ PublishedPort: 3306 }],
        CreatedAt: '2026-06-09T10:00:00Z'
      }
    ]);

    expect(parseComposePsJson(rows)).toEqual([
      {
        name: 'jxmysql',
        containerName: 'jxmysql',
        state: 'running',
        health: 'healthy',
        image: 'mysql:5.6',
        ports: ['3306'],
        startedAt: '2026-06-09T10:00:00Z'
      }
    ]);
  });

  it('normalizes compose ps json-lines rows', () => {
    const rows = [
      JSON.stringify({ Service: 'jxmysql', Name: 'jxmysql', State: 'running' }),
      JSON.stringify({ Service: 'bishop', Name: 'bishop', State: 'running', Health: 'healthy' })
    ].join('\n');

    expect(parseComposePsJson(rows)).toMatchObject([
      { name: 'jxmysql', containerName: 'jxmysql', state: 'running' },
      { name: 'bishop', containerName: 'bishop', state: 'running', health: 'healthy' }
    ]);
  });
});

describe('parseManagedServiceStatuses', () => {
  it('returns every managed compose service, including services not created by Docker yet', () => {
    const rows = JSON.stringify([
      { Service: 'jxmysql', Name: 'jxmysql', State: 'running', Health: 'healthy' },
      { Service: 'paysys', Name: 'paysys', State: 'exited', Health: '' }
    ]);

    expect(parseManagedServiceStatuses(rows)).toMatchObject([
      { name: 'jxmysql', state: 'running', health: 'healthy' },
      { name: 'jxmssql', state: 'not created', health: 'unknown' },
      { name: 'paysys', state: 'stopped', health: 'unknown' },
      { name: 's3relayserver', state: 'not created' },
      { name: 'goddess', state: 'not created' },
      { name: 'bishop', state: 'not created' },
      { name: 's3relay', state: 'not created' },
      { name: 'jxserver', state: 'not created' }
    ]);
  });
});
