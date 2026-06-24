import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateService } from '@/services/updateService';

export const updateKeys = {
  all: ['update'] as const,
  status: () => [...updateKeys.all, 'status'] as const,
  latestRun: () => [...updateKeys.all, 'runs', 'latest'] as const,
  run: (runId: string) => [...updateKeys.all, 'runs', runId] as const,
};

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: updateKeys.status(),
    queryFn: updateService.getStatus,
    refetchInterval: 6 * 60 * 60 * 1000,
  });

  const latestRunQuery = useQuery({
    queryKey: updateKeys.latestRun(),
    queryFn: updateService.getLatestRun,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'restarting' || status === 'verifying' ? 3000 : false;
    },
  });

  const checkMutation = useMutation({
    mutationFn: updateService.checkNow,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: updateKeys.all }),
  });

  const startRunMutation = useMutation({
    mutationFn: updateService.startRun,
    onSuccess: (run) => {
      queryClient.setQueryData(updateKeys.run(run.runId), run);
      void queryClient.invalidateQueries({ queryKey: updateKeys.latestRun() });
    },
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    checkNow: checkMutation.mutateAsync,
    isChecking: checkMutation.isPending,
    latestRun: latestRunQuery.data,
    isLoadingLatestRun: latestRunQuery.isLoading,
    startRun: startRunMutation.mutateAsync,
    isStartingRun: startRunMutation.isPending,
    getRun: updateService.getRun,
    streamUpdate: updateService.streamUpdate,
    streamRun: updateService.streamRun,
  };
}
