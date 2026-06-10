import { describe, expect, it } from 'vitest';
import { formatSseLogEvent, normalizeStreamTail, normalizeTail } from './logStream.js';

describe('normalizeTail', () => {
  it('defaults to 300', () => {
    expect(normalizeTail(undefined)).toBe(300);
  });

  it('clamps low values to 50', () => {
    expect(normalizeTail('1')).toBe(50);
  });

  it('clamps high values to 2000', () => {
    expect(normalizeTail('9999')).toBe(2000);
  });

  it('accepts safe numeric values', () => {
    expect(normalizeTail('500')).toBe(500);
  });

  it('formats log chunks as JSON encoded SSE messages', () => {
    expect(formatSseLogEvent('ready\nnext')).toBe('event: log\ndata: "ready\\nnext"\n\n');
  });
});

describe('normalizeStreamTail', () => {
  it('allows zero so a follow stream can avoid duplicating a loaded snapshot', () => {
    expect(normalizeStreamTail('0')).toBe(0);
  });

  it('defaults realtime streams to 100 lines when tail is omitted', () => {
    expect(normalizeStreamTail(undefined)).toBe(100);
  });
});
