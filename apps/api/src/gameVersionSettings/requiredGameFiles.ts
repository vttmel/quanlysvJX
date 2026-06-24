export const REQUIRED_GAME_FILES = ['gateway/goddess_y', 'gateway/bishop_y', 'gateway/s3relay/s3relay_y','server1/jx_linux_y',] as const;

export type RequiredGameFile = (typeof REQUIRED_GAME_FILES)[number];

export function getRequiredGameFiles(): readonly RequiredGameFile[] {
  return REQUIRED_GAME_FILES;
}
