export type StartPhase = 'inspect' | 'pull' | 'build' | 'start' | 'wait-ready';

export type StartErrorCode =
  | 'COMPOSE_CONFIG_FAILED'
  | 'IMAGE_INSPECT_FAILED'
  | 'PULL_FAILED'
  | 'BUILD_FAILED'
  | 'UP_FAILED'
  | 'STATUS_CHECK_FAILED'
  | 'HEALTH_TIMEOUT'
  | 'START_ALREADY_RUNNING'
  | 'STREAM_ABORTED';

export type StartServiceEvent =
  | { type: 'phase'; phase: StartPhase; message: string }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string }
  | {
      type: 'error';
      code: StartErrorCode;
      phase: StartPhase;
      message: string;
      detail: string;
      exitCode?: number;
    }
  | { type: 'ready'; service: string; state: string; health: string; message: string }
  | { type: 'close'; exitCode: number };
