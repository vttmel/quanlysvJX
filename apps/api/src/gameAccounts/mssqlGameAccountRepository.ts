import type { MssqlConfig } from '../config.js';
import { ServiceUnavailableError } from '../api/errors.js';
import type { GameAccountRepository } from './gameAccountService.js';

export function createMssqlGameAccountRepository(_config: MssqlConfig): GameAccountRepository {
  const unavailable = async () => {
    throw new ServiceUnavailableError('MSSQL account repository is not implemented');
  };
  return {
    list: unavailable,
    existsInPrimaryOrSecondary: unavailable,
    findByName: unavailable,
    create: unavailable,
    update: unavailable,
    softDelete: unavailable
  };
}
