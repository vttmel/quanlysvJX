import { describe, expect, it, vi } from "vitest";
import { UpdateService } from "./updateService.js";
import fs from "node:fs";

describe("UpdateService", () => {
  it("reports update available when latest release tag differs from current version", async () => {
    const service = new UpdateService({
      projectRoot: "/workspace",
      currentVersion: "v1.0.0",
      currentCommit: "abc1234",
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: "v1.1.0",
          htmlUrl: "https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0",
          body: "Release notes",
        }),
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
        stream: vi.fn(),
      },
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    const status = await service.checkForUpdates();

    expect(status).toMatchObject({
      currentVersion: "v1.0.0",
      currentCommit: "abc1234",
      latestVersion: "v1.1.0",
      latestTag: "v1.1.0",
      releaseUrl: "https://github.com/hungnt87/quanlysvJX/releases/tag/v1.1.0",
      releaseNotes: "Release notes",
      hasUpdate: true,
      repoDirty: false,
      checkedAt: "2026-06-24T10:00:00.000Z",
    });
  });

  it("does not block update when local repository status has changes", async () => {
    const commandRunner = {
      run: vi.fn().mockResolvedValue({ code: 0, stdout: " M apps/api/src/app.ts\n", stderr: "" }),
      stream: vi.fn().mockResolvedValue(0),
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const service = new UpdateService({
      projectRoot: "/host/quanlysvJX",
      currentVersion: "v1.0.0",
      currentCommit: "abc1234",
      releaseClient: {
        getLatestRelease: vi
          .fn()
          .mockResolvedValue({ tagName: "v1.1.0", htmlUrl: "url", body: "" }),
      },
      commandRunner,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    await service.runUpdate();
    expect(commandRunner.stream).toHaveBeenCalledTimes(2);

    vi.restoreAllMocks();
  });

  it("starts a detached updater container instead of restarting itself", async () => {
    const originalHostname = process.env.HOSTNAME;
    process.env.HOSTNAME = "api-container";
    vi.spyOn(fs, "existsSync").mockImplementation((filePath) => String(filePath) === "/.dockerenv");
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(1782300000000);
    const commandRunner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ code: 0, stdout: "/host/quanlysvJX\n", stderr: "" })
        .mockResolvedValueOnce({ code: 0, stdout: "updater-id\n", stderr: "" }),
      stream: vi.fn().mockResolvedValue(0),
    };
    const events: unknown[] = [];
    const service = new UpdateService({
      projectRoot: "/workspace",
      currentVersion: "v1.0.0",
      currentCommit: "abc1234",
      updaterImage: "manager-api:test",
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({ tagName: "v1.1.0", htmlUrl: "url", body: "" }),
      },
      commandRunner,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    await service.runUpdate((event) => events.push(event));

    expect(commandRunner.stream).toHaveBeenNthCalledWith(
      1,
      "git",
      ["fetch", "--tags", "origin"],
      "/workspace",
      expect.any(Function),
    );
    expect(commandRunner.stream).toHaveBeenNthCalledWith(
      2,
      "git",
      ["checkout", "-f", "v1.1.0"],
      "/workspace",
      expect.any(Function),
    );
    expect(commandRunner.run).toHaveBeenNthCalledWith(
      1,
      "docker",
      [
        "inspect",
        "api-container",
        "--format",
        '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{end}}{{end}}',
      ],
      "/workspace",
    );
    expect(commandRunner.run).toHaveBeenNthCalledWith(
      2,
      "docker",
      expect.arrayContaining([
        "run",
        "--rm",
        "-d",
        "--name",
        "quanlysvjx-manager-updater-1782300000000",
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock",
        "-v",
        "/host/quanlysvJX:/workspace",
        "-e",
        "MANAGER_PROJECT_ROOT=/host/quanlysvJX",
        "manager-api:test",
        "sh",
        "-c",
      ]),
      "/workspace",
    );
    expect(JSON.stringify(commandRunner.run.mock.calls[1])).toContain(
      "docker compose --project-directory '/host/quanlysvJX' -p quanlysvjx-manager build",
    );
    const updaterArgs = commandRunner.run.mock.calls[1]![1] as string[];
    const updaterScript = updaterArgs.at(-1) ?? "";
    expect(updaterScript.indexOf("docker compose --project-directory '/host/quanlysvJX' -p quanlysvjx-manager build")).toBeGreaterThan(-1);
    expect(updaterScript.indexOf("/workspace/version.json")).toBeGreaterThan(
      updaterScript.indexOf("docker compose --project-directory '/host/quanlysvJX' -p quanlysvjx-manager up -d ui"),
    );
    expect(JSON.stringify(events)).toContain("Updater container đã chạy: updater-id");

    vi.restoreAllMocks();
    process.env.HOSTNAME = originalHostname;
  });

  it("creates missing JX env file before starting updater", async () => {
    const originalHostname = process.env.HOSTNAME;
    process.env.HOSTNAME = "api-container";
    vi.spyOn(fs, "existsSync").mockImplementation((filePath) => {
      const value = String(filePath);
      return value === "/.dockerenv" || value.endsWith("apps/jx-services/.env.example");
    });
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as never);
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    const commandRunner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ code: 0, stdout: "/host/quanlysvJX\n", stderr: "" })
        .mockResolvedValueOnce({ code: 0, stdout: "updater-id\n", stderr: "" }),
      stream: vi.fn().mockResolvedValue(0),
    };
    const events: unknown[] = [];
    const service = new UpdateService({
      projectRoot: "/workspace",
      currentVersion: "v1.0.0",
      currentCommit: "abc1234",
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({ tagName: "v1.1.0", htmlUrl: "url", body: "" }),
      },
      commandRunner,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    await service.runUpdate((event) => events.push(event));

    expect(fs.mkdirSync).toHaveBeenCalledWith("/workspace/apps/jx-services", { recursive: true });
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      "/workspace/apps/jx-services/.env.example",
      "/workspace/apps/jx-services/.env",
    );
    expect(JSON.stringify(events)).toContain("Đã tạo apps/jx-services/.env từ .env.example");

    vi.restoreAllMocks();
    process.env.HOSTNAME = originalHostname;
  });

  it("does not mark verifying run succeeded before updater writes completion", () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => String(p).endsWith("version.json"));
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ version: "v1.1.0", commit: "new" }));
    const run = {
      runId: "run-1",
      status: "verifying",
      stage: "verifying",
      currentVersion: "v1.0.0",
      targetTag: "v1.1.0",
      releaseUrl: "url",
      releaseNotesSnapshot: "notes",
      startedAt: "2026-06-24T10:00:00.000Z",
      updatedAt: "2026-06-24T10:00:00.000Z",
      finishedAt: null,
      failedStep: null,
      failedCommand: null,
      error: null,
      logs: [],
    };
    const runRepository = {
      get: vi.fn().mockReturnValue(run),
      getLatest: vi.fn(),
      getActive: vi.fn(),
      upsert: vi.fn(),
      patch: vi.fn(),
      appendLog: vi.fn(),
    };
    const service = new UpdateService({
      projectRoot: "/workspace",
      releaseClient: { getLatestRelease: vi.fn() },
      commandRunner: { run: vi.fn(), stream: vi.fn() },
      runRepository: runRepository as any,
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    expect(service.getRun("run-1")?.status).toBe("verifying");
    expect(runRepository.patch).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("reads current version from version.json if the file exists", async () => {
    vi.spyOn(fs, "existsSync").mockImplementation((p) => String(p).endsWith("version.json"));
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({
        version: "v1.0.5-json",
        commit: "json123",
      }),
    );

    const service = new UpdateService({
      projectRoot: "/workspace",
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: "v1.1.0",
          htmlUrl: "url",
          body: "",
        }),
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
        stream: vi.fn(),
      },
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    const status = await service.checkForUpdates();
    expect(status.currentVersion).toBe("v1.0.5-json");
    expect(status.currentCommit).toBe("json123");

    vi.restoreAllMocks();
  });

  it("falls back to environment variables when version.json does not exist", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    process.env.APP_VERSION = "v1.0.0-env";
    process.env.APP_COMMIT = "env123";

    const service = new UpdateService({
      projectRoot: "/workspace",
      releaseClient: {
        getLatestRelease: vi.fn().mockResolvedValue({
          tagName: "v1.1.0",
          htmlUrl: "url",
          body: "",
        }),
      },
      commandRunner: {
        run: vi.fn().mockResolvedValue({ code: 0, stdout: "", stderr: "" }),
        stream: vi.fn(),
      },
      now: () => new Date("2026-06-24T10:00:00.000Z"),
    });

    const status = await service.checkForUpdates();
    expect(status.currentVersion).toBe("v1.0.0-env");
    expect(status.currentCommit).toBe("env123");

    vi.restoreAllMocks();
  });
});
