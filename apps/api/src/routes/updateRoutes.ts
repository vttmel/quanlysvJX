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
