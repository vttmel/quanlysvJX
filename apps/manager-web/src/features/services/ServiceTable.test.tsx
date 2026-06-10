import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceStatus } from '../../api/types';
import { ServiceTable } from './ServiceTable';

const services: ServiceStatus[] = [
  {
    name: 'jxmysql',
    containerName: 'jxmysql',
    state: 'running',
    health: 'healthy',
    image: 'mysql:5.6',
    ports: [],
    startedAt: null
  },
  {
    name: 'paysys',
    containerName: 'paysys',
    state: 'stopped',
    health: 'unknown',
    image: '',
    ports: [],
    startedAt: null
  }
];

describe('ServiceTable', () => {
  it('enables actions based on service state', () => {
    render(
      <MantineProvider>
        <ServiceTable services={services} selected={null} onSelect={vi.fn()} onAction={vi.fn()} />
      </MantineProvider>
    );

    const runningRow = screen.getByRole('button', { name: 'jxmysql' }).closest('tr') as HTMLTableRowElement;
    const stoppedRow = screen.getByRole('button', { name: 'paysys' }).closest('tr') as HTMLTableRowElement;

    expect((within(runningRow).getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(runningRow).getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(runningRow).getByRole('button', { name: 'Restart' }) as HTMLButtonElement).disabled).toBe(false);

    expect((within(stoppedRow).getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(stoppedRow).getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(stoppedRow).getByRole('button', { name: 'Restart' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
