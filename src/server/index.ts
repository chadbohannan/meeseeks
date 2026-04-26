import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { ServerState } from './state.js';
import { WsHub, registerWs } from './ws.js';
import { mapErrorToResponse } from './error-mapper.js';
import { AppConfig } from './app-config.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerLaneRoutes } from './routes/lanes.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { readProject, listBoards } from '../storage/project.js';
import { startWatcher } from './watcher.js';
import path from 'node:path';

const PORT = Number(process.env.MEESEEKS_PORT ?? 5174);
const HOST = process.env.MEESEEKS_HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const argPath = process.argv[2];
  const state = new ServerState();
  const hub = new WsHub();
  const appConfig = new AppConfig();
  const app = Fastify({ logger: true });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub, appConfig });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerWs(app, state, hub);

  if (argPath) {
    try {
      const meta = await readProject(path.resolve(argPath));
      const handle = startWatcher(meta, hub);
      state.open(meta, handle.cleanup);
      const boards = await listBoards(meta.path);
      await appConfig.recordRecent(meta.path, meta.config.name);
      app.log.info({ project: meta.path }, 'opened project from CLI');
      hub.broadcast({ type: 'project-opened', payload: { project: meta, boards } });
    } catch (err) {
      app.log.warn({ err }, 'could not open CLI project; starting at picker');
    }
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`meeseeks server on http://${HOST}:${PORT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
