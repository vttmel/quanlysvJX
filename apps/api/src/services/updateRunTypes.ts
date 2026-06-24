export type UpdateRunStatus = 'queued' | 'running' | 'restarting' | 'verifying' | 'succeeded' | 'failed';

export type UpdateRunStage =
  | 'checking'
  | 'preparing'
  | 'fetching'
  | 'checkout'
  | 'building'
  | 'restarting'
  | 'verifying'
  | 'succeeded'
  | 'failed';

export type UpdateRunLogLevel = 'status' | 'log' | 'error';

export type UpdateRunLog = {
  at: string;
  level: UpdateRunLogLevel;
  message: string;
};

export type UpdateRun = {
  runId: string;
  status: UpdateRunStatus;
  stage: UpdateRunStage;
  currentVersion: string;
  targetTag: string;
  releaseUrl: string | null;
  releaseNotesSnapshot: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  failedStep: UpdateRunStage | null;
  failedCommand: string | null;
  error: string | null;
  logs: UpdateRunLog[];
};

export type UpdateRunsFile = {
  version: 1;
  runs: UpdateRun[];
};

export const activeUpdateRunStatuses: UpdateRunStatus[] = ['running', 'restarting', 'verifying'];

export function isActiveUpdateRun(run: UpdateRun): boolean {
  return activeUpdateRunStatuses.includes(run.status);
}
