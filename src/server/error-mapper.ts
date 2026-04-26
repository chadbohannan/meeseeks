import { StorageError } from '../storage/errors.js';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_INPUT: 400,
  PATH_UNSAFE: 400,
  INVALID_LANE: 422,
  PROJECT_NOT_OPEN: 409,
};

export function mapErrorToResponse(
  err: FastifyError | Error,
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof StorageError) {
    const status = STATUS[err.code] ?? 500;
    reply.code(status).send({ error: { code: err.code, message: err.message } });
    return;
  }
  reply.code(500).send({ error: { code: 'INTERNAL', message: 'internal error' } });
  reply.log.error({ err }, 'unhandled error');
}
