import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { ServerState } from './state.js';
import { WsHub, registerWs } from './ws.js';
import { mapErrorToResponse } from './error-mapper.js';
import { registerWorkspaceRoutes } from './routes/workspace.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerWorkflowRoutes } from './routes/workflows.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerRuntimeRoutes } from './routes/runtimes.js';
import { registerFileRoutes } from './routes/files.js';
import { registerPromptRoutes } from './routes/prompts.js';
import { readWorkspace } from '../storage/workspace.js';
import { startWatcher } from './watcher.js';
import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MEESEEKS_PORT ?? 5174);
const HOST = process.env.MEESEEKS_HOST ?? '127.0.0.1';

/**
 * XDG default so a bare `meeseeks` doesn't fall back to cwd — which, run from
 * inside a checkout, silently turned the source tree into the workspace it
 * supervised. Only this default is auto-created; a path passed explicitly
 * still has to exist, so a typo fails loudly instead of spawning a workspace.
 */
function defaultWorkspaceDir(): string {
  const dataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'meeseeks');
}

async function main(): Promise<void> {
  const argPath = process.argv[2];
  const workspaceDir = argPath ? path.resolve(argPath) : defaultWorkspaceDir();

  if (!argPath) {
    mkdirSync(workspaceDir, { recursive: true });
  } else if (!existsSync(workspaceDir)) {
    console.error(`meeseeks: directory does not exist: ${workspaceDir}`);
    process.exit(1);
  }

  const hub = new WsHub();
  const meta = await readWorkspace(workspaceDir);
  const handle = startWatcher(meta, hub);
  const state = new ServerState(meta, handle.cleanup);

  state.supervisor.on('runtime-spawned', (s) => hub.broadcast({ type: 'runtime-spawned', payload: s }));
  state.supervisor.on('runtime-status', (s) => hub.broadcast({ type: 'runtime-status', payload: s }));
  state.supervisor.on('runtime-stdio', (s) => hub.broadcast({ type: 'runtime-stdio', payload: s }));
  state.supervisor.on('runtime-message', (s) => hub.broadcast({ type: 'runtime-message', payload: s }));

  const app = Fastify({ logger: { level: 'warn' } });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerWorkspaceRoutes(app, { state, hub });
  await registerProjectRoutes(app, { state, hub });
  await registerWorkflowRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerRuntimeRoutes(app, { state, hub });
  await registerFileRoutes(app, { state, hub });
  await registerPromptRoutes(app, { state, hub });
  await registerWs(app, state, hub);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDir = path.resolve(__dirname, '../web');
  if (existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/', wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'route not found' } });
        return;
      }
      reply.type('text/html').sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: HOST });
  console.error(`meeseeks open: ${meta.config.name} (${meta.path})`);
  console.error(`meeseeks server on http://${HOST}:${PORT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
