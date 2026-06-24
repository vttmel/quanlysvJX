import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  gameVersionSettingsService,
  type GameVersionSettingsPayload,
} from '@/services/gameVersionSettingsService';
import { systemKeys } from './useSystemInfo';

export const gameVersionSettingsKeys = {
  all: ['game-version-settings'] as const,
  detail: () => [...gameVersionSettingsKeys.all, 'detail'] as const,
  startup: () => [...gameVersionSettingsKeys.all, 'startup'] as const,
};

export function useGameVersionSettings() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: gameVersionSettingsKeys.detail(),
    queryFn: gameVersionSettingsService.getSettings,
  });
  const startupQuery = useQuery({
    queryKey: gameVersionSettingsKeys.startup(),
    queryFn: gameVersionSettingsService.startupCheck,
  });
  const validateMutation = useMutation({ mutationFn: gameVersionSettingsService.validateSettings });
  const saveMutation = useMutation({
    mutationFn: (payload: GameVersionSettingsPayload) =>
      gameVersionSettingsService.saveSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gameVersionSettingsKeys.all });
      void queryClient.invalidateQueries({ queryKey: systemKeys.all });
    },
  });

  return { settingsQuery, startupQuery, validateMutation, saveMutation };
}
