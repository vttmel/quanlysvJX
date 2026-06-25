import { Alert, Button, Card, Group, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { schemaResolver, useForm } from '@mantine/form';
import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useSaveGameNetwork, useSystemInfo } from '@/hooks/useSystemInfo';
import type { GameNetworkConfig } from '@/services/types';

type Props = {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const fallbackConfig: GameNetworkConfig = {
  jxIp: '',
  mysqlIp: '127.0.0.1',
  paysysIp: '127.0.0.1',
  mssqlIp: '127.0.0.1',
  modGame: false,
};

const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const invalidIpv4Message = 'Vui lòng nhập đúng IPv4.';
const invalidHostIpMessage = 'Vui lòng chọn IP thật của máy chủ.';

const ipv4Schema = z.string().regex(ipv4Pattern, invalidIpv4Message);

function createGameNetworkSchema(ipChoices: string[]) {
  return z.object({
    jxIp: z
      .string()
      .min(1, invalidHostIpMessage)
      .refine((value) => ipChoices.includes(value), invalidHostIpMessage),
    mysqlIp: ipv4Schema,
    paysysIp: ipv4Schema,
    mssqlIp: ipv4Schema,
    modGame: z.boolean().optional(),
  });
}

export function GameNetworkConfigPanel({ onSuccess, onError }: Props) {
  const { data, isLoading } = useSystemInfo();
  const saveMutation = useSaveGameNetwork();
  const form = useForm<GameNetworkConfig>({
    initialValues: fallbackConfig,
    validate: (values) =>
      schemaResolver(createGameNetworkSchema(data?.ipChoices ?? []), { sync: true })(values),
  });

  useEffect(() => {
    if (data?.gameNetwork) {
      form.setValues(data.gameNetwork);
    }
  }, [data?.gameNetwork]);

  const ipOptions = useMemo(() => {
    if (data?.serverIpChoices?.length) {
      return data.serverIpChoices.map((choice) => ({
        value: choice.address,
        label: `${choice.interfaceName} - ${choice.address} (${choice.kind === 'vpn' ? 'VPN' : 'Host'})`,
      }));
    }

    return (data?.ipChoices ?? []).map((ip) => ({ value: ip, label: ip }));
  }, [data?.ipChoices, data?.serverIpChoices]);

  const setField = (field: keyof GameNetworkConfig, value: string | null) => {
    form.setFieldValue(field, value ?? '');
    form.clearFieldError(field);
  };

  const handleSave = async () => {
    const validation = await form.validate();
    if (validation.hasErrors) {
      return;
    }

    saveMutation.mutate(form.values, {
      onSuccess: (result) => onSuccess(result.message),
      onError: (error) => {
        const message = error instanceof Error ? error.message : 'Không thể lưu cấu hình IP game';
        const serverErrors = getServerFieldErrors(message);
        if (Object.keys(serverErrors).length > 0) {
          form.setErrors(serverErrors);
          return;
        }
        onError(message);
      },
    });
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="md">
        <div>
          <Title order={4}>Cấu hình IP & Mod game</Title>
          <Text size="xs" c="dimmed">
            Lưu IP và cấu hình mod vào .env; restart dịch vụ để container áp dụng cấu hình mới.
          </Text>
        </div>

        {data?.coreServicesRunning && (
          <Alert color="yellow" title="Cần restart dịch vụ để áp dụng">
            Đang chạy: {data.runningCoreServices.join(', ')}
          </Alert>
        )}

        {data?.rawJxIp && !data.ipChoices.includes(data.rawJxIp) && (
          <Alert color="red" title="IP không khả dụng">
            IP hiện tại trong file .env ({data.rawJxIp}) không khớp với bất kỳ IP mạng nào của máy
            chủ (host hoặc VPN). Vui lòng chọn lại một IP hợp lệ dưới đây và Lưu cấu hình.
          </Alert>
        )}

        <Group grow align="flex-start">
          <Select
            label="Game server IP"
            data={ipOptions}
            value={form.values.jxIp}
            onChange={(value) => setField('jxIp', value)}
            disabled={isLoading || saveMutation.isPending}
            placeholder="Chưa tìm thấy IP host"
            error={
              form.errors.jxIp ||
              (data?.rawJxIp && !data.ipChoices.includes(data.rawJxIp)
                ? 'IP hiện tại không khả dụng'
                : null)
            }
          />
          <TextInput
            label="IP Dữ liệu Đăng nhập (MySQL)"
            value={form.values.mysqlIp}
            onChange={(event) => setField('mysqlIp', event.currentTarget.value)}
            disabled={isLoading || saveMutation.isPending}
            inputMode="numeric"
            placeholder="127.0.0.1"
            error={form.errors.mysqlIp}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput
            label="Paysys IP"
            value={form.values.paysysIp}
            onChange={(event) => setField('paysysIp', event.currentTarget.value)}
            disabled={isLoading || saveMutation.isPending}
            inputMode="numeric"
            placeholder="127.0.0.1"
            error={form.errors.paysysIp}
          />
          <TextInput
            label="IP Dữ liệu Nhân vật (MSSQL)"
            value={form.values.mssqlIp}
            onChange={(event) => setField('mssqlIp', event.currentTarget.value)}
            disabled={isLoading || saveMutation.isPending}
            inputMode="numeric"
            placeholder="127.0.0.1"
            error={form.errors.mssqlIp}
          />
        </Group>

        <Switch
          label="Kích hoạt Mod game"
          description="Khởi chạy Game Server với thư viện bổ trợ (LD_PRELOAD=./vdk.so)"
          checked={form.values.modGame}
          onChange={(event) => form.setFieldValue('modGame', event.currentTarget.checked)}
          disabled={isLoading || saveMutation.isPending}
        />

        <Group justify="flex-end">
          <Button onClick={handleSave} loading={saveMutation.isPending} disabled={isLoading}>
            Lưu cấu hình
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

function getServerFieldErrors(message: string): Partial<Record<keyof GameNetworkConfig, string>> {
  if (message.includes('IPv4')) {
    return {
      mysqlIp: invalidIpv4Message,
      paysysIp: invalidIpv4Message,
      mssqlIp: invalidIpv4Message,
    };
  }

  if (message.includes('IP thật') || message.includes('chọn IP')) {
    return { jxIp: invalidHostIpMessage };
  }

  return {};
}
