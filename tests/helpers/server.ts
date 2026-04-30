import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { ServerState } from '../../src/server/state.js';
import { WsHub, registerWs } from '../../src/server/ws.js';
import { mapErrorToResponse } from '../../src/server/error-mapper.js';
import { registerProjectRoutes } from '../../src/server/routes/projects.js';
import { registerBoardRoutes } from '../../src/server/routes/boards.js';
import { registerLaneRoutes } from '../../src/server/routes/lanes.js';
import { registerTicketRoutes } from '../../src/server/routes/tickets.js';
import { registerRuntimeRoutes } from '../../src/server/routes/runtimes.js';
import { registerFileRoutes } from '../../src/server/routes/files.js';
import { readProject } from '../../src/storage/project.js';
import { startWatcher } from '../../src/server/watcher.js';

export interface TestServer {
  app: FastifyInstance;
  state: ServerState;
  hub: WsHub;
  port: number;
  url: string;
  cleanup(): Promise<void>;
}

export async function bootTestServer(projectRoot: string): Promise<TestServer> {
  const meta = await readProject(projectRoot);
  const hub = new WsHub();
  const handle = startWatcher(meta, hub);
  const state = new ServerState(meta, handle.cleanup);
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerRuntimeRoutes(app, { state, hub });
  await registerFileRoutes(app, { state, hub });
  state.supervisor.on('runtime-spawned', (s) => hub.broadcast({ type: 'runtime-spawned', payload: s }));
  state.supervisor.on('runtime-status', (s) => hub.broadcast({ type: 'runtime-status', payload: s }));
  state.supervisor.on('runtime-stdio', (s) => hub.broadcast({ type: 'runtime-stdio', payload: s }));
  await registerWs(app, state, hub);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  const port = address.port;
  return {
    app, state, hub, port, url: `http://127.0.0.1:${port}`,
    async cleanup() {
      await state.shutdown();
      await app.close();
    },
  };
}
