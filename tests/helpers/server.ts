import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import { ServerState } from '../../src/server/state.js';
import { WsHub, registerWs } from '../../src/server/ws.js';
import { mapErrorToResponse } from '../../src/server/error-mapper.js';
import { registerProjectRoutes } from '../../src/server/routes/projects.js';
import { registerBoardRoutes } from '../../src/server/routes/boards.js';
import { registerLaneRoutes } from '../../src/server/routes/lanes.js';
import { registerTicketRoutes } from '../../src/server/routes/tickets.js';
import { AppConfig } from '../../src/server/app-config.js';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

export interface TestServer {
  app: FastifyInstance;
  state: ServerState;
  hub: WsHub;
  appConfig: AppConfig;
  port: number;
  url: string;
  cleanup(): Promise<void>;
}

export async function bootTestServer(): Promise<TestServer> {
  const cfgDir = await mkdtemp(path.join(tmpdir(), 'meeseeks-srv-'));
  const appConfig = new AppConfig(path.join(cfgDir, 'recents.json'));
  const state = new ServerState();
  const hub = new WsHub();
  const app = Fastify({ logger: false });
  await app.register(websocket);
  app.setErrorHandler(mapErrorToResponse);
  await registerProjectRoutes(app, { state, hub, appConfig });
  await registerBoardRoutes(app, { state, hub });
  await registerLaneRoutes(app, { state, hub });
  await registerTicketRoutes(app, { state, hub });
  await registerWs(app, state, hub);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  const port = address.port;
  return {
    app, state, hub, appConfig, port, url: `http://127.0.0.1:${port}`,
    async cleanup() {
      await state.close();
      await app.close();
      await rm(cfgDir, { recursive: true, force: true });
    },
  };
}
