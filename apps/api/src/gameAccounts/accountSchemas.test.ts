import { describe, expect, it } from 'vitest';
import { createGameAccountSchema, listGameAccountsQuerySchema, updateGameAccountSchema } from './accountSchemas.js';

describe('game account schemas', () => {
  it('defaults list paging to page 1 and pageSize 10', () => {
    expect(listGameAccountsQuerySchema.parse({})).toEqual({ search: '', page: 1, pageSize: 10 });
  });

  it('caps pageSize at 100', () => {
    expect(listGameAccountsQuerySchema.parse({ pageSize: '1000' }).pageSize).toBe(100);
  });

  it('accepts safe account names and rejects unsafe names', () => {
    expect(createGameAccountSchema.parse({
      accountName: 'jx_user-01',
      password: 'secret123',
      secondaryPassword: 'pin456',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    }).accountName).toBe('jx_user-01');

    expect(() => createGameAccountSchema.parse({
      accountName: '../bad',
      password: 'secret123',
      secondaryPassword: 'pin456',
      expiresAt: '2027-06-10',
      leftSeconds: 0
    })).toThrow();
  });

  it('allows update without password fields', () => {
    expect(updateGameAccountSchema.parse({ expiresAt: '2027-06-10', leftSeconds: 0 })).toEqual({
      expiresAt: '2027-06-10',
      leftSeconds: 0
    });
  });
});
