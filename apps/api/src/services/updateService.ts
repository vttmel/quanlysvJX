import { spawn } from 'node:child_process';

export type UpdateStatus = {
  currentVersion: string;
  currentCommit: string;
  latestVersion: string | null;
  latestTag: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  hasUpdate: boolean;
  repoDirty: boolean;
  checkedAt: string | null;
};

export type LatestRelease = {
  tagName: string;
  htmlUrl: string;
  body: string | null;
};

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = {
  run(command: string, args: string[], cwd: string): Promise<CommandResult>;
  stream(command: string, args: string[], cwd: string, onData: (line: string) => void): Promise<number>;
};

export type ReleaseClient = {
  getLatestRelease(): Promise<LatestRelease | null>;
};

export type UpdateEvent =
  | { type: 'status'; message: string }
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'restarting'; message: string };

type UpdateServiceDeps = {
  projectRoot: string;
  currentVersion: string;
  currentCommit: string;
  releaseClient: ReleaseClient;
  commandRunner: CommandRunner;
  now: () => Date;
};

export class GitHubReleaseClient implements ReleaseClient {
  constructor(private readonly owner: string, private readonly repo: string) {}

  async getLatestRelease(): Promise<LatestRelease | null> {
    const response = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'quanlysvJX-manager' }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub release check failed: ${response.status}`);
    const body = (await response.json()) as { tag_name: string; html_url: string; body: string | null };
    return { tagName: body.tag_name, htmlUrl: body.html_url, body: body.body };
  }
}

export class ProcessCommandRunner implements CommandRunner {
  async run(command: string, args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
      child.on('close', (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }));
    });
  }

  async stream(command: string, args: string[], cwd: string, onData: (line: string) => void): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false });
      child.stdout.on('data', (chunk) => onData(Buffer.from(chunk).toString('utf8')));
      child.stderr.on('data', (chunk) => onData(Buffer.from(chunk).toString('utf8')));
      child.on('close', (code) => resolve(code ?? 1));
    });
  }
}

export class UpdateService {
  private cachedStatus: UpdateStatus | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {}

  async getStatus(): Promise<UpdateStatus> {
    if (this.cachedStatus) return { ...this.cachedStatus, repoDirty: await this.isRepoDirty() };
    return this.checkForUpdates();
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    const [release, repoDirty] = await Promise.all([
      this.deps.releaseClient.getLatestRelease(),
      this.isRepoDirty()
    ]);
    const status: UpdateStatus = {
      currentVersion: this.deps.currentVersion,
      currentCommit: this.deps.currentCommit,
      latestVersion: release?.tagName ?? null,
      latestTag: release?.tagName ?? null,
      releaseUrl: release?.htmlUrl ?? null,
      releaseNotes: release?.body ?? null,
      hasUpdate: Boolean(release?.tagName && release.tagName !== this.deps.currentVersion),
      repoDirty,
      checkedAt: this.deps.now().toISOString()
    };
    this.cachedStatus = status;
    return status;
  }

  async runUpdate(onEvent: (event: UpdateEvent) => void = () => undefined): Promise<void> {
    const status = await this.checkForUpdates();
    if (status.repoDirty) throw new Error('Repository has uncommitted changes');
    if (!status.latestTag) throw new Error('No GitHub release found');
    this.assertSafeTag(status.latestTag);

    await this.streamStep('git', ['fetch', '--tags', 'origin'], onEvent);
    await this.streamStep('git', ['checkout', status.latestTag], onEvent);
    onEvent({ type: 'restarting', message: 'Rebuilding manager services' });
    await this.streamStep('docker', ['compose', 'up', '-d', '--build', 'api', 'ui'], onEvent);
  }

  private async isRepoDirty(): Promise<boolean> {
    const result = await this.deps.commandRunner.run('git', ['status', '--porcelain'], this.deps.projectRoot);
    if (result.code !== 0) throw new Error(result.stderr || 'Unable to read repository status');
    return result.stdout.trim().length > 0;
  }

  private async streamStep(command: string, args: string[], onEvent: (event: UpdateEvent) => void): Promise<void> {
    onEvent({ type: 'status', message: [command, ...args].join(' ') });
    const code = await this.deps.commandRunner.stream(command, args, this.deps.projectRoot, (message) => onEvent({ type: 'log', message }));
    if (code !== 0) throw new Error(`${command} ${args.join(' ')} failed with code ${code}`);
  }

  private assertSafeTag(tag: string): void {
    if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
      throw new Error('Release tag is not a valid semantic version');
    }
  }
}
