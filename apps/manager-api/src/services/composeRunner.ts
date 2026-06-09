import { spawn } from 'node:child_process';
import { CommandError } from '../api/errors.js';

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function buildComposeArgs(args: readonly string[]) {
  return ['compose', ...args];
}

export async function runDockerCompose(args: readonly string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', buildComposeArgs(args), { cwd, shell: false });
    let stdout = '';
    let stderr = '';

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
