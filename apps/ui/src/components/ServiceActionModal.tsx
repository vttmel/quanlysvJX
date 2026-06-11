import { Button, Group, Modal, Text, Box, ScrollArea, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { serviceService } from '@/services/serviceService';
import type { ServiceStatus } from '@/services/types';

type Props = {
  opened: boolean;
  service: string | null;
  action: 'stop' | 'restart' | 'start' | null;
  loading: boolean;
  services: ServiceStatus[];
  onClose: () => void;
  onConfirm: () => void;
  onComplete?: () => void;
};

export function ServiceActionModal({
  opened,
  service,
  action,
  loading,
  services,
  onClose,
  onConfirm,
  onComplete,
}: Props) {
  const [logs, setLogs] = useState('');
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeEventSourceRef = useRef<EventSource | null>(null);
  const activeStreamTargetRef = useRef<{ service: string; action: string } | null>(null);

  const onCompleteRef = useRef(onComplete);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onCloseRef.current = onClose;
  }, [onComplete, onClose]);

  // Reset confirm close state when modal opens/closes
  useEffect(() => {
    if (!opened) {
      setShowConfirmClose(false);
    }
  }, [opened]);

  // Lắng nghe trạng thái dịch vụ từ props để tự động đóng khi hoàn tất
  useEffect(() => {
    if (!opened || !loading || !service || !action) {
      return;
    }

    const currentService = services.find((s) => s.name === service);
    if (!currentService) {
      return;
    }

    // Xác định xem dịch vụ có hỗ trợ healthcheck hay không
    // Docker Compose trả về:
    // - health: 'healthy' | 'unhealthy' | 'starting'
    // - Hoặc rỗng/không có trường health (đối với container không cấu hình healthcheck)
    const hasHealthCheck =
      currentService.health && currentService.health !== '' && currentService.health !== 'none';

    let isStartSuccess = false;
    if (action === 'start' || action === 'restart') {
      if (hasHealthCheck) {
        // Nếu dịch vụ cấu hình healthcheck: chỉ coi là hoàn tất khi trạng thái là running VÀ health đạt 'healthy'
        isStartSuccess = currentService.state === 'running' && currentService.health === 'healthy';
      } else {
        // Nếu không có healthcheck: chỉ cần trạng thái là running
        isStartSuccess = currentService.state === 'running';
      }
    }

    const isStopSuccess =
      action === 'stop' &&
      (currentService.state === 'stopped' || currentService.state === 'not created');

    if (isStartSuccess || isStopSuccess) {
      setLogs((current) => `${current}\n[Hệ thống] Tác vụ thực thi thành công!\n`);

      // Đóng EventSource sớm
      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
        activeEventSourceRef.current = null;
        activeStreamTargetRef.current = null;
      }

      // Đóng modal và hiển thị Toast thông báo
      setTimeout(() => {
        notifications.show({
          title: 'Thành công',
          message: `${action === 'start' ? 'Khởi động' : action === 'stop' ? 'Dừng' : 'Khởi động lại'} dịch vụ ${service} thành công!`,
          color: 'green',
        });
        if (onCompleteRef.current) {
          onCompleteRef.current();
        }
      }, 1500);
    }
  }, [services, opened, loading, service, action]);

  useEffect(() => {
    if (!loading || !service || !opened || !action) {
      setLogs('');
      if (activeEventSourceRef.current) {
        activeEventSourceRef.current.close();
        activeEventSourceRef.current = null;
      }
      activeStreamTargetRef.current = null;
      return undefined;
    }

    // Nếu đã kết nối cho service và action này thì không chạy lại
    if (
      activeStreamTargetRef.current?.service === service &&
      activeStreamTargetRef.current?.action === action &&
      activeEventSourceRef.current
    ) {
      return undefined;
    }

    // Đóng kết nối cũ nếu có trước khi mở mới
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
    }

    const initialMsg =
      action === 'start'
        ? `[Hệ thống] Đang chạy lệnh khởi dựng container cho dịch vụ ${service}...\n`
        : `[Hệ thống] Đang dừng/khởi động lại dịch vụ ${service}...\n`;

    setLogs(initialMsg);
    activeStreamTargetRef.current = { service, action };

    let connectionTimeout: NodeJS.Timeout | null = null;
    let source: EventSource | null = null;
    let streamEnded = false;

    if (action === 'start') {
      // Trì hoãn 250ms để tránh việc React StrictMode mount/unmount/mount liên tục khởi tạo trùng lặp
      connectionTimeout = setTimeout(() => {
        if (!loading || !service || !opened || !action) {
          return;
        }

        source = new EventSource(serviceService.startStreamUrl(service));
        activeEventSourceRef.current = source;

        const appendLog = (event: MessageEvent<string>) => {
          let chunk = event.data;
          try {
            chunk = JSON.parse(event.data) as string;
          } catch {
            void 0;
          }

          setLogs((current) => {
            // Lọc trùng lặp dòng log liên tiếp
            const currentLines = current.split('\n');
            const lastLine =
              currentLines[currentLines.length - 1] || currentLines[currentLines.length - 2] || '';
            const incomingLines = chunk.split('\n');

            const filteredIncoming = incomingLines.filter((line, index) => {
              const cleanedLine = line.trim();
              if (!cleanedLine) {
                return true;
              }
              // So sánh với dòng ngay trước đó trong cụm log mới hoặc log cũ
              const previousItem = incomingLines[index - 1];
              const prev = index === 0 ? lastLine.trim() : previousItem ? previousItem.trim() : '';
              return cleanedLine !== prev;
            });

            return `${current}${filteredIncoming.join('\n')}`;
          });
        };

        const handleCloseEvent = (event: Event) => {
          streamEnded = true;
          const messageEvent = event as MessageEvent;
          let data: { exitCode?: number } = {};
          try {
            data = JSON.parse(messageEvent.data);
          } catch {
            void 0;
          }

          if (source) {
            source.close();
          }
          if (activeEventSourceRef.current === source) {
            activeEventSourceRef.current = null;
            activeStreamTargetRef.current = null;
          }

          if (data.exitCode === 0) {
            // Không làm gì, để useEffect auto-close theo dõi status polling từ services.
            // Hoặc nếu dịch vụ chưa kịp polling lên healthy/running thì ta in log kết thúc.
            setLogs(
              (current) => `${current}\n[Hệ thống] Tiến trình khởi chạy đã kết thúc thành công!\n`
            );
          } else {
            notifications.show({
              title: 'Lỗi tiến trình',
              message: `Tiến trình kết thúc với mã lỗi: ${data.exitCode ?? 'Không xác định'}.`,
              color: 'red',
            });
            if (onCloseRef.current) {
              onCloseRef.current();
            }
          }
        };

        const handleError = (_event: Event) => {
          // Trì hoãn báo lỗi để đợi handleCloseEvent chạy trước và thiết lập streamEnded = true
          setTimeout(() => {
            if (streamEnded) {
              return;
            }
            // Chỉ báo lỗi "Mất kết nối" nếu EventSource bị ngắt đột ngột mà KHÔNG phải do server end stream (close event)
            if (source) {
              source.close();
            }
            if (activeEventSourceRef.current === source) {
              activeEventSourceRef.current = null;
              activeStreamTargetRef.current = null;
            }

            notifications.show({
              title: 'Lỗi kết nối',
              message: `Mất kết nối theo dõi tiến trình của dịch vụ ${service}.`,
              color: 'red',
            });

            if (onCloseRef.current) {
              onCloseRef.current();
            }
          }, 150);
        };

        source.addEventListener('log', appendLog);
        source.addEventListener('close', handleCloseEvent);
        source.addEventListener('error', handleError);
      }, 250);

      return () => {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        if (source) {
          source.close();
        }
        if (activeEventSourceRef.current === source && source !== null) {
          activeEventSourceRef.current = null;
          activeStreamTargetRef.current = null;
        }
      };
    } else if (action === 'restart') {
      // Vì restart không dùng stream, ta tự động chạy qua POST API trực tiếp trong modal
      let active = true;
      serviceService
        .runServiceAction(service, 'restart')
        .then(() => {
          if (!active) {
            return;
          }
          setLogs((current) => `${current}\n[Hệ thống] Đã gửi lệnh khởi động lại thành công.\n`);
        })
        .catch((err) => {
          if (!active) {
            return;
          }
          const errMsg = err instanceof Error ? err.message : 'Khởi động lại thất bại';
          setLogs((current) => `${current}\n[Hệ thống Lỗi] ${errMsg}\n`);
          notifications.show({
            title: 'Lỗi khởi động lại',
            message: errMsg,
            color: 'red',
          });
          if (onCloseRef.current) {
            onCloseRef.current();
          }
        });

      return () => {
        active = false;
      };
    }
  }, [loading, service, opened, action]);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCloseClick = () => {
    if (loading) {
      setShowConfirmClose(true);
    } else {
      onClose();
    }
  };

  const handleConfirmCloseClick = () => {
    if (activeEventSourceRef.current) {
      activeEventSourceRef.current.close();
      activeEventSourceRef.current = null;
    }
    activeStreamTargetRef.current = null;
    if (onCloseRef.current) {
      onCloseRef.current();
    }
  };

  const cleanLogs = (str: string) => {
    const stripped = str.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    );
    const lines = stripped.split('\n');
    return lines
      .map((line) => {
        const parts = line.split('\r');
        return parts[parts.length - 1];
      })
      .join('\n');
  };

  const verb = action === 'start' ? 'Khởi động' : action === 'stop' ? 'Dừng' : 'Khởi động lại';

  return (
    <Modal
      opened={opened}
      onClose={handleCloseClick}
      title="Xác nhận hành động dịch vụ"
      centered
      size={loading ? 'lg' : 'md'}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      {showConfirmClose ? (
        <>
          <Text mb="md">
            Tiến trình đang chạy ngầm trong container. Đóng giao diện theo dõi lúc này có thể làm
            mất thông tin tiến trình. Bạn có chắc chắn muốn đóng modal?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowConfirmClose(false)}>
              Quay lại theo dõi
            </Button>
            <Button color="red" onClick={handleConfirmCloseClick}>
              Xác nhận đóng
            </Button>
          </Group>
        </>
      ) : !loading ? (
        <>
          <Text mb="md">
            Bạn có chắc chắn muốn thực hiện hành động <strong>{verb.toLowerCase()}</strong> dịch vụ{' '}
            <strong>{service}</strong>?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Hủy
            </Button>
            <Button color="blue" onClick={onConfirm}>
              Xác nhận
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Text mb="sm" fw={700} c="blue">
            {verb} dịch vụ {service}... Vui lòng đợi trong giây lát.
          </Text>
          <Box style={{ position: 'relative' }} mb="md">
            <ScrollArea
              viewportRef={viewportRef}
              h={250}
              type="auto"
              offsetScrollbars
              style={{
                backgroundColor: '#0a0a0a',
                borderRadius: '4px',
                border: '1px solid #333',
              }}
            >
              <Box
                p="sm"
                style={{
                  fontFamily: 'JetBrains Mono, Courier New, Courier, monospace',
                  fontSize: '12px',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                  color: '#4af626',
                }}
              >
                {cleanLogs(logs) || 'Đang kết nối tới container terminal logs...'}
              </Box>
            </ScrollArea>
          </Box>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
              Không tắt trình duyệt khi đang thực thi lệnh...
            </Text>
            <Group gap="xs">
              <Loader size="xs" color="blue" />
              <Text size="sm" c="blue" fw={500}>
                Đang thực hiện, vui lòng chờ...
              </Text>
            </Group>
          </Group>
        </>
      )}
    </Modal>
  );
}
