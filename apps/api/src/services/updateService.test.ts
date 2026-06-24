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
      projectRoot: "/workspace",
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
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(1782300000000);
    const commandRunner = {
      run: vi.fn().mockResolvedValue({ code: 0, stdout: "updater-id\n", stderr: "" }),
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
    expect(commandRunner.run).toHaveBeenCalledWith(
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
        "/workspace:/workspace",
        "manager-api:test",
        "sh",
        "-c",
      ]),
      "/workspace",
    );
    expect(JSON.stringify(commandRunner.run.mock.calls[0])).toContain(
      "docker compose -p quanlysvjx-manager build",
    );
    expect(JSON.stringify(events)).toContain("Updater container đã chạy: updater-id");

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
