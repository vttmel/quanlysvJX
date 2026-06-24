import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { UpdateRunRepository } from "./updateRunRepository.js";
import type { UpdateRun, UpdateRunLogLevel, UpdateRunStage, UpdateRunStatus } from "./updateRunTypes.js";

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
  stream(
    command: string,
    args: string[],
    cwd: string,
    onData: (line: string) => void,
  ): Promise<number>;
};

export type ReleaseClient = {
  getLatestRelease(): Promise<LatestRelease | null>;
};

export type UpdateEvent =
  | { type: "status"; message: string }
  | { type: "log"; message: string }
  | { type: "error"; message: string }
  | { type: "restarting"; message: string };

type UpdateServiceDeps = {
  projectRoot: string;
  currentVersion?: string;
  currentCommit?: string;
  updaterImage?: string;
  releaseClient: ReleaseClient;
  commandRunner: CommandRunner;
  runRepository?: UpdateRunRepository;
  now: () => Date;
};

export class GitHubReleaseClient implements ReleaseClient {
  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async getLatestRelease(): Promise<LatestRelease | null> {
    const response = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "quanlysvJX-manager" },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub release check failed: ${response.status}`);
    const body = (await response.json()) as {
      tag_name: string;
      html_url: string;
      body: string | null;
    };
    return { tagName: body.tag_name, htmlUrl: body.html_url, body: body.body };
  }
}

export class ProcessCommandRunner implements CommandRunner {
  async run(command: string, args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.on("close", (code) =>
        resolve({
          code: code ?? 1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      );
    });
  }

  async stream(
    command: string,
    args: string[],
    cwd: string,
    onData: (line: string) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(command, args, { cwd, shell: false });
      child.stdout.on("data", (chunk) => onData(Buffer.from(chunk).toString("utf8")));
      child.stderr.on("data", (chunk) => onData(Buffer.from(chunk).toString("utf8")));
      child.on("close", (code) => resolve(code ?? 1));
    });
  }
}

export class UpdateService {
  private cachedStatus: UpdateStatus | null = null;
  private readonly runRepository: UpdateRunRepository;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.runRepository =
      deps.runRepository ??
      new UpdateRunRepository(path.join(deps.projectRoot, "apps/jx-services/mount/update/update-runs.json"));
  }

  private getLocalVersion(): { version: string; commit: string } {
    const versionFilePath = path.join(this.deps.projectRoot, "version.json");
    let version = this.deps.currentVersion ?? process.env.APP_VERSION ?? "0.0.0-dev";
    let commit = this.deps.currentCommit ?? process.env.APP_COMMIT ?? "unknown";

    if (fs.existsSync(versionFilePath)) {
      try {
        const raw = fs.readFileSync(versionFilePath, "utf8");
        const data = JSON.parse(raw);
        if (data.version) {
          version = data.version;
        }
        if (data.commit) {
          commit = data.commit;
        }
      } catch {
        // Fallback
      }
    }
    return { version, commit };
  }

  async getStatus(): Promise<UpdateStatus> {
    if (this.cachedStatus) return { ...this.cachedStatus, repoDirty: await this.isRepoDirty() };
    return this.checkForUpdates();
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    const [release, repoDirty] = await Promise.all([
      this.deps.releaseClient.getLatestRelease(),
      this.isRepoDirty(),
    ]);
    const { version, commit } = this.getLocalVersion();
    const status: UpdateStatus = {
      currentVersion: version,
      currentCommit: commit,
      latestVersion: release?.tagName ?? null,
      latestTag: release?.tagName ?? null,
      releaseUrl: release?.htmlUrl ?? null,
      releaseNotes: release?.body ?? null,
      hasUpdate: Boolean(release?.tagName && release.tagName !== version),
      repoDirty,
      checkedAt: this.deps.now().toISOString(),
    };
    this.cachedStatus = status;
    return status;
  }

  async runUpdate(onEvent: (event: UpdateEvent) => void = () => undefined): Promise<void> {
    const status = await this.checkForUpdates();
    if (status.repoDirty) throw new Error("Repository has uncommitted changes");
    if (!status.latestTag) throw new Error("No GitHub release found");
    this.assertSafeTag(status.latestTag);

    await this.streamStep("git", ["fetch", "--tags", "origin"], onEvent);
    await this.streamStep("git", ["checkout", "-f", status.latestTag], onEvent);
    this.ensureJxEnvFile(onEvent);
    
    // Ghi đè phiên bản mới nhất vào file version.json ngay sau khi checkout
    try {
      const versionFilePath = path.join(this.deps.projectRoot, "version.json");
      const versionData = {
        version: status.latestTag,
        commit: "unknown"
      };
      fs.writeFileSync(versionFilePath, JSON.stringify(versionData, null, 2) + "\n", "utf8");
      onEvent({ type: "status", message: `Đã cập nhật file version.json thành ${status.latestTag}` });
    } catch (err) {
      onEvent({ type: "status", message: `Cảnh báo: Không thể ghi file version.json: ${err instanceof Error ? err.message : String(err)}` });
    }

    onEvent({
      type: "restarting",
      message: "Đang tạo updater container để build và khởi động lại API/UI...",
    });
    await this.startDetachedUpdater(status.latestTag, onEvent);
  }

  async startUpdateRun(): Promise<UpdateRun> {
    const activeRun = this.reconcileRun(this.runRepository.getActive());
    if (activeRun) {
      return activeRun;
    }

    const status = await this.checkForUpdates();
    if (status.repoDirty) throw new Error("Repository has uncommitted changes");
    if (!status.latestTag) throw new Error("No GitHub release found");
    this.assertSafeTag(status.latestTag);

    const now = this.deps.now().toISOString();
    const run: UpdateRun = {
      runId: `update-${Date.now()}`,
      status: "running",
      stage: "checking",
      currentVersion: status.currentVersion,
      targetTag: status.latestTag,
      releaseUrl: status.releaseUrl,
      releaseNotesSnapshot: status.releaseNotes,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      failedStep: null,
      failedCommand: null,
      error: null,
      logs: [{ at: now, level: "status", message: `Bắt đầu cập nhật lên ${status.latestTag}` }],
    };

    this.runRepository.upsert(run);
    void this.executeRun(run.runId);
    return run;
  }

  getRun(runId: string): UpdateRun | null {
    return this.reconcileRun(this.runRepository.get(runId));
  }

  getLatestRun(): UpdateRun | null {
    return this.reconcileRun(this.runRepository.getLatest());
  }

  private async executeRun(runId: string): Promise<void> {
    const run = this.runRepository.get(runId);
    if (!run) return;

    try {
      this.setRunStage(runId, "preparing");
      this.ensureJxEnvFile((event) => this.appendRunLog(runId, "status", event.message));

      this.setRunStage(runId, "fetching");
      await this.streamRunStep(runId, "git", ["fetch", "--tags", "origin"]);

      this.setRunStage(runId, "checkout");
      await this.streamRunStep(runId, "git", ["checkout", "-f", run.targetTag]);

      this.setRunStage(runId, "building");
      await this.startDetachedUpdater(run.targetTag, (event) => this.appendRunLog(runId, "status", event.message), runId);

      this.setRunStage(runId, "restarting", "restarting");
      this.setRunStage(runId, "verifying", "verifying");
    } catch (error) {
      const failedRun = this.runRepository.get(runId);
      this.failRun(runId, failedRun?.stage ?? "failed", null, error);
    }
  }

  private async streamRunStep(runId: string, command: string, args: string[]): Promise<void> {
    const commandText = [command, ...args].join(" ");
    this.appendRunLog(runId, "status", commandText);
    const code = await this.deps.commandRunner.stream(command, args, this.deps.projectRoot, (message) =>
      this.appendRunLog(runId, "log", message),
    );
    if (code !== 0) {
      throw new Error(`${commandText} failed with code ${code}`);
    }
  }

  private appendRunLog(runId: string, level: UpdateRunLogLevel, message: string): void {
    this.runRepository.appendLog(runId, { at: this.deps.now().toISOString(), level, message });
  }

  private setRunStage(runId: string, stage: UpdateRunStage, status: UpdateRunStatus = "running"): void {
    const now = this.deps.now().toISOString();
    this.runRepository.patch(runId, (run) => ({ ...run, stage, status, updatedAt: now }));
    this.appendRunLog(runId, "status", stage);
  }

  private failRun(runId: string, stage: UpdateRunStage, command: string | null, error: unknown): void {
    const now = this.deps.now().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    this.runRepository.patch(runId, (run) => ({
      ...run,
      status: "failed",
      stage: "failed",
      updatedAt: now,
      finishedAt: now,
      failedStep: stage,
      failedCommand: command,
      error: message,
      logs: [...run.logs, { at: now, level: "error", message }],
    }));
  }

  private succeedRun(runId: string): UpdateRun | null {
    const now = this.deps.now().toISOString();
    return this.runRepository.patch(runId, (run) => ({
      ...run,
      status: "succeeded",
      stage: "succeeded",
      updatedAt: now,
      finishedAt: now,
      logs: [...run.logs, { at: now, level: "status", message: `Đã cập nhật thành công ${run.targetTag}` }],
    }));
  }

  private reconcileRun(run: UpdateRun | null): UpdateRun | null {
    return run;
  }

  private writeVersionFile(tag: string, onEvent: (event: UpdateEvent) => void): void {
    try {
      const versionFilePath = path.join(this.deps.projectRoot, "version.json");
      fs.writeFileSync(versionFilePath, JSON.stringify({ version: tag, commit: "unknown" }, null, 2) + "\n", "utf8");
      onEvent({ type: "status", message: `Đã cập nhật file version.json thành ${tag}` });
    } catch (err) {
      onEvent({
        type: "status",
        message: `Cảnh báo: Không thể ghi file version.json: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async startDetachedUpdater(
    tag: string,
    onEvent: (event: UpdateEvent) => void,
    runId?: string,
  ): Promise<void> {
    const updaterName = `quanlysvjx-manager-updater-${Date.now()}`;
    const updaterImage = this.deps.updaterImage ?? "quanlysvjx-manager-api";
    const hostProjectRoot = await this.resolveUpdaterProjectRoot(onEvent);
    const composeCommand = `docker compose --project-directory ${this.shellQuote(hostProjectRoot)} -p quanlysvjx-manager`;
    const failWriter = this.buildUpdateRunWriterCommand("failed", "failed", "Updater failed");
    const versionWriter = this.buildVersionWriterCommand(tag);
    const successWriter = this.buildUpdateRunWriterCommand("succeeded", "succeeded", `Đã cập nhật thành công ${tag}`);
    const script = [
      "set -eu",
      `[ -z "${runId ?? ""}" ] || trap ${this.shellQuote(`${failWriter}; exit 1`)} ERR`,
      `echo '[updater] applying ${tag}'`,
      `${composeCommand} build`,
      `${composeCommand} up -d api`,
      `${composeCommand} up -d ui`,
      versionWriter,
      `[ -z "${runId ?? ""}" ] || ${successWriter}`,
      "echo '[updater] done'",
    ].join("; ");
    const result = await this.deps.commandRunner.run(
      "docker",
      [
        "run",
        "--rm",
        "-d",
        "--name",
        updaterName,
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock",
        "-v",
        `${hostProjectRoot}:/workspace`,
        "-w",
        "/workspace",
        "--network",
        "host",
        "-e",
        "COMPOSE_PROJECT_NAME=quanlysvjx-manager",
        "-e",
        `MANAGER_PROJECT_ROOT=${hostProjectRoot}`,
        "-e",
        `UPDATE_RUN_ID=${runId ?? ""}`,
        "-e",
        `UPDATE_TARGET_TAG=${tag}`,
        "-e",
        "UPDATE_RUNS_FILE=/workspace/apps/jx-services/mount/update/update-runs.json",
        updaterImage,
        "sh",
        "-c",
        script,
      ],
      this.deps.projectRoot,
    );

    if (result.code !== 0) {
      throw new Error(`docker run updater failed: ${result.stderr || result.stdout}`.trim());
    }

    onEvent({
      type: "status",
      message: `Updater container đã chạy: ${result.stdout.trim() || updaterName}`,
    });
  }

  private buildUpdateRunWriterCommand(status: UpdateRunStatus, stage: UpdateRunStage, message: string): string {
    const code = `
const fs = require('fs');
const file = process.env.UPDATE_RUNS_FILE;
const runId = process.env.UPDATE_RUN_ID;
if (file && runId && fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const run = data.runs.find((item) => item.runId === runId);
  if (run) {
    const now = new Date().toISOString();
    run.status = ${JSON.stringify(status)};
    run.stage = ${JSON.stringify(stage)};
    run.updatedAt = now;
    run.finishedAt = now;
    if (${JSON.stringify(status)} === 'failed') {
      run.failedStep = run.stage;
      run.error = ${JSON.stringify(message)};
    }
    run.logs.push({ at: now, level: ${JSON.stringify(status === "failed" ? "error" : "status")}, message: ${JSON.stringify(message)} });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\\n', 'utf8');
  }
}
`;
    return `node -e ${this.shellQuote(code)}`;
  }

  private buildVersionWriterCommand(tag: string): string {
    const code = `
const fs = require('fs');
fs.writeFileSync('/workspace/version.json', JSON.stringify({ version: ${JSON.stringify(tag)}, commit: 'unknown' }, null, 2) + '\\n', 'utf8');
`;
    return `node -e ${this.shellQuote(code)}`;
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`;
  }

  private async resolveUpdaterProjectRoot(onEvent: (event: UpdateEvent) => void): Promise<string> {
    if (this.deps.projectRoot !== "/workspace") {
      return this.deps.projectRoot;
    }

    const containerId = process.env.HOSTNAME;
    if (!containerId || !fs.existsSync("/.dockerenv")) {
      throw new Error("Cannot resolve host project root for updater container");
    }

    const result = await this.deps.commandRunner.run(
      "docker",
      [
        "inspect",
        containerId,
        "--format",
        '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}',
      ],
      this.deps.projectRoot,
    );
    const hostProjectRoot = result.stdout.trim();
    if (result.code !== 0 || !hostProjectRoot) {
      throw new Error(`Cannot resolve /workspace host mount: ${result.stderr || result.stdout}`.trim());
    }

    onEvent({ type: "status", message: `Dùng host project root: ${hostProjectRoot}` });
    return hostProjectRoot;
  }

  private ensureJxEnvFile(onEvent: (event: UpdateEvent) => void): void {
    const envFilePath = path.join(this.deps.projectRoot, "apps/jx-services/.env");
    const exampleFilePath = path.join(this.deps.projectRoot, "apps/jx-services/.env.example");

    if (fs.existsSync(envFilePath)) {
      return;
    }

    if (!fs.existsSync(exampleFilePath)) {
      onEvent({
        type: "status",
        message: "Cảnh báo: Không tìm thấy apps/jx-services/.env.example để tạo .env",
      });
      return;
    }

    fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
    fs.copyFileSync(exampleFilePath, envFilePath);
    onEvent({ type: "status", message: "Đã tạo apps/jx-services/.env từ .env.example" });
  }

  private async isRepoDirty(): Promise<boolean> {
    // Luôn trả về false để bỏ qua kiểm tra thay đổi cục bộ (repoDirty) theo yêu cầu người dùng
    return false;
  }

  private async streamStep(
    command: string,
    args: string[],
    onEvent: (event: UpdateEvent) => void,
  ): Promise<void> {
    onEvent({ type: "status", message: [command, ...args].join(" ") });
    const code = await this.deps.commandRunner.stream(
      command,
      args,
      this.deps.projectRoot,
      (message) => onEvent({ type: "log", message }),
    );
    if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed with code ${code}`);
  }

  private assertSafeTag(tag: string): void {
    if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) {
      throw new Error("Release tag is not a valid semantic version");
    }
  }
}
