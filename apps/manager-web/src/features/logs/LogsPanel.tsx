import { Button, Group, NumberInput, Paper, Select, Stack, Switch, Text, Textarea } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

type Props = {
  services: string[];
  selected: string | null;
  onSelect: (service: string) => void;
  onError: (message: string) => void;
};

const MAX_LOG_LINES = 5000;

export function LogsPanel({ services, selected, onSelect, onError }: Props) {
  const [tail, setTail] = useState(300);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [streamReady, setStreamReady] = useState(false);
  const shouldFollowRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadLogs = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setStreamReady(false);
    try {
      setLogs((await api.logs(selected, tail)).logs);
      shouldFollowRef.current = true;
      setStreamReady(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to load logs');
    } finally {
      setLoading(false);
    }
  }, [onError, selected, tail]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!selected || !autoFollow || !streamReady) return undefined;

    const source = new EventSource(api.logStreamUrl(selected, 0));
    const appendLog = (event: MessageEvent<string>) => {
      setLogs((current) => limitLogLines(`${current}${parseLogChunk(event.data)}`));
    };

    source.addEventListener('log', appendLog);

    return () => {
      source.close();
    };
  }, [autoFollow, selected, streamReady, tail]);

  useEffect(() => {
    if (!autoFollow || !shouldFollowRef.current) return;

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [autoFollow, logs]);

  function handleScroll() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const distanceFromBottom = textarea.scrollHeight - textarea.scrollTop - textarea.clientHeight;
    shouldFollowRef.current = distanceFromBottom < 24;
  }

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="end">
          <Text fw={700}>Docker logs</Text>
          <Switch
            label="Auto follow"
            checked={autoFollow}
            onChange={(event) => {
              shouldFollowRef.current = event.currentTarget.checked;
              setAutoFollow(event.currentTarget.checked);
            }}
          />
        </Group>
        <Group grow align="end">
          <Select label="Service" data={services} value={selected} onChange={(value) => value && onSelect(value)} />
          <NumberInput
            label="Tail"
            min={50}
            max={2000}
            value={tail}
            onChange={(value) => setTail(typeof value === 'number' ? value : Number(value) || 300)}
          />
        </Group>
        <Group justify="space-between">
          <Button variant="default" onClick={() => setLogs('')}>Clear</Button>
          <Button loading={loading} onClick={loadLogs}>Refresh logs</Button>
        </Group>
        <Textarea
          ref={textareaRef}
          className="logsBox"
          value={logs}
          readOnly
          autosize
          minRows={12}
          maxRows={20}
          onScroll={handleScroll}
        />
      </Stack>
    </Paper>
  );
}

function parseLogChunk(data: string) {
  try {
    return JSON.parse(data) as string;
  } catch {
    return data;
  }
}

function limitLogLines(value: string) {
  const lines = value.split('\n');
  if (lines.length <= MAX_LOG_LINES) {
    return value;
  }

  return lines.slice(-MAX_LOG_LINES).join('\n');
}
