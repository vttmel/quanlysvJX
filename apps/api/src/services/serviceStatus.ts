import { z } from 'zod';
import { assertServiceName, serviceNames, type ServiceName } from './serviceAllowlist.js';

const publisherSchema = z.object({ PublishedPort: z.union([z.string(), z.number()]).optional() }).passthrough();

const composeRowSchema = z
  .object({
    Service: z.string(),
    Name: z.string().optional(),
    State: z.string().optional(),
    Health: z.string().optional(),
    Image: z.string().optional(),
    Publishers: z.array(publisherSchema).optional(),
    CreatedAt: z.string().optional()
  })
  .passthrough();

export type ServiceStatus = {
  name: ServiceName;
  containerName: string;
  state: string;
  health: string;
  image: string;
  ports: string[];
  startedAt: string | null;
};

export function parseComposePsJson(stdout: string): ServiceStatus[] {
  const rows = z.array(composeRowSchema).parse(parseComposeRows(stdout));
  const managedRows = rows.filter((row) => (serviceNames as readonly string[]).includes(row.Service));

  return managedRows.map(normalizeComposeRow);
}

export function parseManagedServiceStatuses(stdout: string): ServiceStatus[] {
  const discovered = new Map(parseComposePsJson(stdout).map((service) => [service.name, service]));

  return serviceNames.map((name) => discovered.get(name) ?? createMissingServiceStatus(name));
}

function normalizeComposeRow(row: z.infer<typeof composeRowSchema>): ServiceStatus {
  return {
    name: assertServiceName(row.Service),
    containerName: row.Name ?? row.Service,
    state: normalizeState(row.State),
    health: normalizeHealth(row.Health),
    image: row.Image ?? '',
    ports: (row.Publishers ?? []).flatMap((publisher) =>
      publisher.PublishedPort === undefined ? [] : [String(publisher.PublishedPort)]
    ),
    startedAt: row.CreatedAt ?? null
  };
}

function createMissingServiceStatus(name: ServiceName): ServiceStatus {
  return {
    name,
    containerName: name,
    state: 'not created',
    health: 'unknown',
    image: '',
    ports: [],
    startedAt: null
  };
}

function normalizeState(value: string | undefined) {
  const state = value?.trim().toLowerCase();
  if (!state) return 'unknown';
  if (state === 'exited' || state === 'dead') return 'stopped';
  if (state === 'restarting') return 'starting';
  return state;
}

function normalizeHealth(value: string | undefined) {
  return value?.trim() || 'unknown';
}

function parseComposeRows(stdout: string) {
  const text = stdout.trim();
  if (text.length === 0) {
    return [];
  }

  if (text.startsWith('[')) {
    return JSON.parse(text) as unknown;
  }

  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as unknown);
}
