import { describe, expect, it } from 'vitest';
import { hashGamePassword } from './passwordHash.js';

describe('hashGamePassword', () => {
  it('returns uppercase MD5 hashes', () => {
    expect(hashGamePassword('a')).toBe('0CC175B9C0F1B6A831C399E269772661');
  });

  it('hashes the exact input string', () => {
    expect(hashGamePassword('Password123')).toBe('42F749ADE7F9E195BF475F37A44CAFCB');
  });
});
