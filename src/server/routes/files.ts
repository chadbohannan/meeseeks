import type { FastifyInstance } from 'fastify';
import type { ServerState } from '../state.js';
import type { WsHub } from '../ws.js';
import { InvalidInputError } from '../../storage/errors.js';
import { listFiles, readFile, writeFile, deleteFile } from '../../storage/files.js';
import { getBoard } from '../../storage/project.js';
import path from 'node:path';
import type {
  ListFilesResponse,
  ReadFileResponse,
  WriteFileResponse,
  PatchFileResponse,
} from '../../shared/api.js';

const NAMESPACE_DIRS: Record<string, string> = {
  skills: '.claude/skills',
  prompts: '.claude/prompts',
  hooks: '.claude/hooks',
  bin: '.claude/bin',
};

const ALLOWED_NAMESPACES = new Set(['skills', 'bin']);

function getFullPath(boardPath: string, namespace: string, filepath: string): string {
  const namespaceDir = NAMESPACE_DIRS[namespace];
  if (!namespaceDir) {
    throw new InvalidInputError(`unsupported namespace: ${namespace}`);
  }
  return path.join(boardPath, namespaceDir, filepath);
}

export async function registerFileRoutes(
  app: FastifyInstance,
  deps: { state: ServerState; hub?: WsHub }
): Promise<void> {
  const { state } = deps;

  // List files in namespace
  app.get<{
    Params: { boardId: string; namespace: string };
  }>('/api/boards/:boardId/files/:namespace', async (req, reply) => {
    const { boardId, namespace } = req.params;

    if (!ALLOWED_NAMESPACES.has(namespace)) {
      throw new InvalidInputError(`Namespace "${namespace}" is not supported`);
    }

    const open = state.require();
    const board = await getBoard(open.meta.path, boardId);

    const files = await listFiles(board.path, namespace);
    const response: ListFilesResponse = { files };
    return reply.send(response);
  });

  // Read file content
  app.get<{
    Params: { boardId: string; namespace: string; '*': string };
  }>('/api/boards/:boardId/files/:namespace/*', async (req, reply) => {
    const { boardId, namespace } = req.params;
    const filepath = req.params['*'];

    if (!filepath) {
      throw new InvalidInputError('File path is required');
    }

    if (!ALLOWED_NAMESPACES.has(namespace)) {
      throw new InvalidInputError(`Namespace "${namespace}" is not supported`);
    }

    const open = state.require();
    const board = await getBoard(open.meta.path, boardId);

    const content = await readFile(board.path, namespace, filepath);
    const fullPath = getFullPath(board.path, namespace, filepath);
    const response: ReadFileResponse = { content, path: fullPath };
    return reply.send(response);
  });

  // Create new file
  app.post<{
    Params: { boardId: string; namespace: string; '*': string };
    Body: { content: string };
  }>('/api/boards/:boardId/files/:namespace/*', async (req, reply) => {
    const { boardId, namespace } = req.params;
    const filepath = req.params['*'];
    const { content } = req.body;

    if (!filepath) {
      throw new InvalidInputError('File path is required');
    }

    if (!ALLOWED_NAMESPACES.has(namespace)) {
      throw new InvalidInputError(`Namespace "${namespace}" is not supported`);
    }

    if (typeof content !== 'string') {
      throw new InvalidInputError('Content is required and must be a string');
    }

    const open = state.require();
    const board = await getBoard(open.meta.path, boardId);

    await writeFile(board.path, namespace, filepath, content);
    const fullPath = getFullPath(board.path, namespace, filepath);
    const response: WriteFileResponse = { ok: true, path: fullPath };
    return reply.send(response);
  });

  // Update existing file
  app.patch<{
    Params: { boardId: string; namespace: string; '*': string };
    Body: { content: string };
  }>('/api/boards/:boardId/files/:namespace/*', async (req, reply) => {
    const { boardId, namespace } = req.params;
    const filepath = req.params['*'];
    const { content } = req.body;

    if (!filepath) {
      throw new InvalidInputError('File path is required');
    }

    if (!ALLOWED_NAMESPACES.has(namespace)) {
      throw new InvalidInputError(`Namespace "${namespace}" is not supported`);
    }

    if (typeof content !== 'string') {
      throw new InvalidInputError('Content is required and must be a string');
    }

    const open = state.require();
    const board = await getBoard(open.meta.path, boardId);

    // Verify file exists before updating
    await readFile(board.path, namespace, filepath);

    await writeFile(board.path, namespace, filepath, content);
    const response: PatchFileResponse = { ok: true };
    return reply.send(response);
  });

  // Delete file
  app.delete<{
    Params: { boardId: string; namespace: string; '*': string };
  }>('/api/boards/:boardId/files/:namespace/*', async (req, reply) => {
    const { boardId, namespace } = req.params;
    const filepath = req.params['*'];

    if (!filepath) {
      throw new InvalidInputError('File path is required');
    }

    if (!ALLOWED_NAMESPACES.has(namespace)) {
      throw new InvalidInputError(`Namespace "${namespace}" is not supported`);
    }

    const open = state.require();
    const board = await getBoard(open.meta.path, boardId);

    await deleteFile(board.path, namespace, filepath);
    return reply.send({ ok: true });
  });
}
