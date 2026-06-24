import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateService } from '@/services/updateService';

export const updateKeys = {
  all: ['update'] as const,
  status: () => [...updateKeys.all, 'status'] as const,
};

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: updateKeys.status(),
    queryFn: updateService.getStatus,
    refetchInterval: 6 * 60 * 60 * 1000,
  });

  const checkMutation = useMutation({
    mutationFn: updateService.checkNow,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: updateKeys.all }),
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    checkNow: checkMutation.mutateAsync,
    isChecking: checkMutation.isPending,
    streamUpdate: updateService.streamUpdate,
  };
}
