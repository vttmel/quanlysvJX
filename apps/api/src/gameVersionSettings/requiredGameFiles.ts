export const REQUIRED_GAME_FILES = ['goddes_y', 'bishop_y', 'server', 'gateway'] as const;

export type RequiredGameFile = (typeof REQUIRED_GAME_FILES)[number];

export function getRequiredGameFiles(): readonly RequiredGameFile[] {
  return REQUIRED_GAME_FILES;
}
