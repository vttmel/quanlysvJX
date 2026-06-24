import type { FastifyInstance, FastifyReply } from "fastify";
import { success } from "../utils/response.js";
import {
  GitHubReleaseClient,
  ProcessCommandRunner,
  UpdateService,
  type UpdateEvent,
} from "../services/updateService.js";

function writeSse(reply: FastifyReply, event: UpdateEvent): void {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function registerUpdateRoutes(app: FastifyInstance, service?: UpdateService) {
  const updateService =
    service ??
    new UpdateService({
      projectRoot: app.deps.config.hostProjectRoot ?? app.deps.config.projectRoot,
      releaseClient: new GitHubReleaseClient("hungnt87", "quanlysvJX"),
      commandRunner: new ProcessCommandRunner(),
      now: () => new Date(),
    });

  app.get("/api/update/status", async (_request, reply) =>
    reply.send(success(await updateService.getStatus())),
  );
  app.post("/api/update/check", async (_request, reply) =>
    reply.send(success(await updateService.checkForUpdates())),
  );
  app.post("/api/update/run", async (_request, reply) =>
    reply.send(success(await updateService.startUpdateRun())),
  );
  app.get("/api/update/runs/latest", async (_request, reply) =>
    reply.send(success(updateService.getLatestRun())),
  );
  app.get<{ Params: { runId: string } }>("/api/update/runs/:runId", async (request, reply) => {
    const run = updateService.getRun(request.params.runId);
    if (!run) return reply.status(404).send({ status: "error", message: "Update run not found" });
    return reply.send(success(run));
  });
  app.get<{ Params: { runId: string } }>("/api/update/runs/:runId/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    let sent = 0;
    const interval = setInterval(() => {
      const run = updateService.getRun(request.params.runId);
      if (!run) {
        writeSse(reply, { type: "error", message: "Update run not found" });
        clearInterval(interval);
        reply.raw.end();
        return;
      }

      for (const log of run.logs.slice(sent)) {
        writeSse(reply, { type: log.level === "error" ? "error" : "log", message: log.message });
      }
      sent = run.logs.length;

      if (run.status === "succeeded" || run.status === "failed") {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1000);

    reply.raw.on("close", () => clearInterval(interval));
  });
  app.get("/api/update/run/stream", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    try {
      await updateService.runUpdate((event) => writeSse(reply, event));
    } catch (error) {
      writeSse(reply, {
        type: "error",
        message: error instanceof Error ? error.message : "Update failed",
      });
    } finally {
      reply.raw.end();
    }
  });
}
