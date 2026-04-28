import path from 'node:path';
import os from 'node:os';
import type { SpawnContext, SpawnSpec } from './types.js';

const HARNESS_BIN = 'claude';

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveAllowedPath(p: string, lanePath: string): string {
  const expanded = expandHome(p);
  return path.isAbsolute(expanded) ? expanded : path.resolve(lanePath, expanded);
}

export function buildSpawnSpec(ctx: SpawnContext): SpawnSpec {
  const argv: string[] = [HARNESS_BIN];
  argv.push('--output-format', 'stream-json');
  argv.push('--input-format', 'stream-json');
  argv.push('--verbose');

  const model = ctx.board?.runtime?.model;
  if (model) argv.push('--model', model);

  for (const p of ctx.permissions?.allowedPaths ?? []) {
    argv.push('--add-dir', resolveAllowedPath(p, ctx.lanePath));
  }

  const allowedTools = ctx.permissions?.allowedTools ?? [];
  const deniedTools = ctx.permissions?.deniedTools ?? [];

  const serverPort = Number(process.env.MEESEEKS_PORT ?? 5174);
  const notifyBase = `http://127.0.0.1:${serverPort}/internal/runtime/${ctx.runtimeId}/notify`;
  const settingsObj: Record<string, unknown> = {
    hooks: {
      Notification: [
        {
          matcher: 'idle_prompt',
          hooks: [{ type: 'command', command: `curl -sf "${notifyBase}?state=idle"` }],
        },
        {
          matcher: 'permission_prompt',
          hooks: [{ type: 'command', command: `curl -sf "${notifyBase}?state=awaiting-user"` }],
        },
      ],
    },
  };
  if (allowedTools.length > 0 || deniedTools.length > 0) {
    settingsObj.permissions = { allow: allowedTools, deny: deniedTools };
  }
  const filePath = path.join(ctx.boardPath, '.meeseeks', `session-${ctx.runtimeId}.json`);
  const settingsFile: SpawnSpec['settingsFile'] = {
    path: filePath,
    body: JSON.stringify(settingsObj, null, 2),
  };
  argv.push('--settings', filePath);

  for (const a of ctx.board?.runtime?.args ?? []) argv.push(a);

  const boardName = path.basename(ctx.boardPath);
  const processLine = ctx.processDocPath
    ? ` Lane process doc: \`${ctx.processDocPath}\`.`
    : '';
  const preamble =
    `You are working on ticket \`${ctx.ticketRef.filename}\` in lane \`${ctx.ticketRef.laneName}\` of board \`${boardName}\`. ` +
    `Ticket file: \`${ctx.ticketAbsPath}\`.${processLine}`;

  argv.push('--append-system-prompt', preamble);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    MEESEEKS_TICKET_PATH: ctx.ticketAbsPath,
    MEESEEKS_BOARD_PATH: ctx.boardPath,
    MEESEEKS_LANE_PATH: ctx.lanePath,
    ...(ctx.board?.runtime?.env ?? {}),
  };
  if (ctx.board?.runtime?.provider) env.CLAUDE_CODE_PROVIDER = ctx.board.runtime.provider;

  return { argv, env, cwd: ctx.boardPath, preamble, settingsFile };
}
