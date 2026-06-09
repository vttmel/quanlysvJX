import { ValidationError } from '../api/errors.js';

export const serviceNames = [
  'jxmysql',
  'jxmssql',
  'paysys',
  's3relayserver',
  'goddess',
  'bishop',
  's3relay',
  'jxserver'
] as const;

export type ServiceName = (typeof serviceNames)[number];

export function assertServiceName(value: string): ServiceName {
  if ((serviceNames as readonly string[]).includes(value)) {
    return value as ServiceName;
  }

  throw new ValidationError(`Unsupported service: ${value}`);
}
