import { Box, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

type ModalTitleProps = {
  title: ReactNode;
  subtitle?: ReactNode;
};

const trafficLights = [
  'var(--mantine-color-red-5)',
  'var(--mantine-color-yellow-5)',
  'var(--mantine-color-green-5)',
];

export function ModalTitle({ title, subtitle }: ModalTitleProps) {
  return (
    <Group gap="sm" wrap="nowrap" align="center">
      <Group gap={5} wrap="nowrap" aria-hidden="true">
        {trafficLights.map((color) => (
          <Box
            key={color}
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: color,
              boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.12)',
              flex: '0 0 auto',
            }}
          />
        ))}
      </Group>
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text fw={700} size="sm" lh={1.2} truncate="end">
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" c="dimmed" lh={1.2} truncate="end">
            {subtitle}
          </Text>
        ) : null}
      </Stack>
    </Group>
  );
}
