import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import path from 'node:path';
import { CommandError } from '../utils/errors.js';
import { readEnvMap } from '../env/envFile.js';

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type ComposeStream = EventEmitter & {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill: (signal?: NodeJS.Signals) => boolean;
};

export type ComposeRunnerOptions = {
  projectRoot?: string;
};

export function buildComposeArgs(args: readonly string[], options: ComposeRunnerOptions = {}) {
  const progressArgs = shouldUsePlainProgress(args) ? ['--ansi', 'never', '--progress', 'plain'] : [];
  const projectDirectoryArgs = options.projectRoot
    ? ['--project-directory', path.join(options.projectRoot, 'apps/jx-services')]
    : [];

  return [
    'compose',
    ...progressArgs,
    ...projectDirectoryArgs,
    '--env-file',
    'apps/jx-services/.env',
    '-f',
    'apps/jx-services/docker-compose.yaml',
    ...args
  ];
}

export function buildDockerArgs(args: readonly string[]) {
  return [...args];
}

function shouldUsePlainProgress(args: readonly string[]) {
  return args[0] === 'build' || (args[0] === 'up' && args.includes('--build'));
}

function getSpawnEnv(cwd: string, args: readonly string[]): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (args[0] === 'compose') {
    for (const file of ['apps/jx-services/.env']) {
      try {
        const envFilePath = path.join(cwd, file);
        const envMap = readEnvMap(envFilePath);
        for (const key of Object.keys(envMap)) {
          delete env[key];
        }
      } catch {
        // Bỏ qua lỗi
      }
    }
  }
  return env;
}

export async function runDockerCompose(
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer },
  runnerOptions: ComposeRunnerOptions = {}
): Promise<CommandResult> {
  return runCommand('docker', buildComposeArgs(args, runnerOptions), cwd, options);
}

export async function runDocker(
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return runCommand('docker', buildDockerArgs(args), cwd, options);
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  options?: { stdin?: string | Buffer }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: getSpawnEnv(cwd, args) });
    let stdout = '';
    let stderr = '';

    if (options?.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(new CommandError(error.message));
    });
    child.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

export function runDockerComposeStream(
  args: readonly string[],
  cwd: string,
  runnerOptions: ComposeRunnerOptions = {}
): ComposeStream {
  const composeArgs = buildComposeArgs(args, runnerOptions);
  return spawn('docker', composeArgs, { cwd, shell: false, env: getSpawnEnv(cwd, composeArgs) });
}

export function runDockerStream(args: readonly string[], cwd: string): ComposeStream {
  return spawn('docker', buildDockerArgs(args), { cwd, shell: false });
}

