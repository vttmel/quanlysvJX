import { Grid, Stack, Button, Group } from '@mantine/core';
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ServiceActionModal } from '@/components/ServiceActionModal';
import { useServices, serviceKeys } from '@/hooks/useServices';
import { LogsPanel } from './components/LogsPanel';
import { ServiceTable } from './components/ServiceTable';
import { PrepareImagesModal } from './components/PrepareImagesModal';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [selectedService, setSelectedService] = useState<string | null>('all');
  const [actionTarget, setActionTarget] = useState<{
    service: string;
    action: 'start' | 'stop' | 'restart';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { services, runAction } = useServices(true); // polling status every 5 seconds

  const [prepareOpened, setPrepareOpened] = useState(false);
  const [servicesToPrepare, setServicesToPrepare] = useState<string[]>([]);

  const handleSelectService = useCallback((service: string | null) => {
    setSelectedService(service);
  }, []);

  const handleRunAction = useCallback((service: string, action: 'start' | 'stop' | 'restart') => {
    setActionTarget({ service, action });
  }, []);

  const handleConfirmAction = useCallback(() => {
    if (!actionTarget) {
      return;
    }
    setActionLoading(true);

    // Chỉ hành động stop là chạy qua POST API trực tiếp.
    // Hành động start/restart được thực hiện và theo dõi trực tiếp qua SSE của ServiceActionModal.
    if (actionTarget.action === 'stop') {
      runAction(
        { service: actionTarget.service, action: actionTarget.action },
        {
          onSuccess: () => {
            // Modal tự động đóng thông qua polling trạng thái của useServices
          },
          onError: () => {
            setActionLoading(false);
          },
        }
      );
    }
  }, [actionTarget, runAction]);

  const handleCloseModal = useCallback(() => {
    setActionTarget(null);
    setActionLoading(false);
  }, []);

  const handleLogsError = useCallback((_msg: string) => {
    // Error notification handled globally
  }, []);

  const handlePrepareAllImages = useCallback(() => {
    const uniqueMissingServices: string[] = [];
    const seenImages = new Set<string>();

    services.forEach((s) => {
      if (!s.imageExists && !seenImages.has(s.imageName)) {
        seenImages.add(s.imageName);
        uniqueMissingServices.push(s.name);
      }
    });

    if (uniqueMissingServices.length > 0) {
      setServicesToPrepare(uniqueMissingServices);
      setPrepareOpened(true);
    }
  }, [services]);

  const handlePrepareSuccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: serviceKeys.all });
  }, [queryClient]);

  const missingImagesCount = services.reduce((acc, s) => {
    if (!s.imageExists) {
      acc.add(s.imageName);
    }
    return acc;
  }, new Set<string>()).size;

  return (
    <Stack gap="md">
      {missingImagesCount > 0 && (
        <Group justify="flex-start">
          <Button color="blue" onClick={handlePrepareAllImages}>
            {`Tải hàng loạt docker image (${missingImagesCount})`}
          </Button>
        </Group>
      )}
      <Grid align="stretch">
        <Grid.Col span={{ base: 12, md: 3 }}>
          <ServiceTable
            services={services}
            selected={selectedService}
            onSelect={handleSelectService}
            onAction={handleRunAction}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <LogsPanel
            services={services.map((s) => s.name)}
            selected={selectedService}
            onSelect={handleSelectService}
            onError={handleLogsError}
          />
        </Grid.Col>
      </Grid>
      <ServiceActionModal
        opened={actionTarget !== null}
        service={actionTarget?.service ?? null}
        action={actionTarget?.action ?? null}
        loading={actionLoading}
        services={services}
        onClose={handleCloseModal}
        onConfirm={handleConfirmAction}
        onComplete={handleCloseModal}
      />
      <PrepareImagesModal
        opened={prepareOpened}
        onClose={() => setPrepareOpened(false)}
        servicesToPrepare={servicesToPrepare}
        servicesInfo={services}
        onSuccess={handlePrepareSuccess}
      />
    </Stack>
  );
}
