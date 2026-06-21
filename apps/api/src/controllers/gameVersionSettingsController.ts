import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GameVersionSettingsPayload, GameVersionSettingsService } from '../services/gameVersionSettingsService.js';
import { success } from '../utils/response.js';

export class GameVersionSettingsController {
  constructor(private readonly service: GameVersionSettingsService) {}

  async getSettings(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success(this.service.getSettings()));
  }

  async validateSettings(request: FastifyRequest<{ Body: GameVersionSettingsPayload }>, reply: FastifyReply) {
    return reply.send(success(this.service.validateSettings(request.body)));
  }

  async saveSettings(request: FastifyRequest<{ Body: GameVersionSettingsPayload }>, reply: FastifyReply) {
    return reply.send(success(this.service.saveSettings(request.body)));
  }

  async startupCheck(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success(this.service.startupCheck()));
  }
}
