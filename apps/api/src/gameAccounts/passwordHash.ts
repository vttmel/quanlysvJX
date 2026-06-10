import { createHash } from 'node:crypto';

export function hashGamePassword(password: string): string {
  return createHash('md5').update(password, 'utf8').digest('hex').toUpperCase();
}
