export function normalizeTail(value: unknown): number | 'all' {
  if (value === 'all') {
    return 'all';
  }
  const parsed = typeof value === 'string' ? Number(value) : 300;
  if (!Number.isFinite(parsed)) {
    return 300;
  }

  return Math.min(2000, Math.max(50, Math.trunc(parsed)));
}

export function normalizeStreamTail(value: unknown): number | 'all' {
  if (value === 'all') {
    return 'all';
  }
  const parsed = typeof value === 'string' ? Number(value) : 100;
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(2000, Math.max(0, Math.trunc(parsed)));
}

export function formatSseLogEvent(chunk: string, event = 'log') {
  return `event: ${event}\ndata: ${JSON.stringify(chunk)}\n\n`;
}
