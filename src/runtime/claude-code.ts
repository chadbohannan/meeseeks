import path from 'node:path';
import { execSync } from 'node:child_process';
import { permissionValues } from './permissions.js';
import type { SpawnContext, SpawnSpec, PromptSpawnContext, SpawnProject } from './types.js';

function resolveHarnessBin(): string {
  try {
    return execSync('which claude', { encoding: 'utf8' }).trim();
  } catch {
    return 'claude';
  }
}

const HARNESS_BIN = resolveHarnessBin();

function projectLocationSentence(project: SpawnProject): string {
  return `Project \`${project.name}\` is rooted at \`${project.root}\`. ` +
    `Perform code work in the project root.`;
}

export function buildSpawnSpec(ctx: SpawnContext): SpawnSpec {
  const argv: string[] = [HARNESS_BIN];
  argv.push('--verbose');

  const model = ctx.model ?? ctx.runtime?.model;
  if (model) argv.push('--model', model);

  if (ctx.project) argv.push('--add-dir', ctx.project.root);

  // Already absolute and unioned across project and workflow by resolvePermissions.
  for (const p of ctx.permissions?.allowedPaths ?? []) {
    argv.push('--add-dir', p.value);
  }

  const allowedTools = permissionValues(ctx.permissions?.allowedTools ?? []);
  const deniedTools = permissionValues(ctx.permissions?.deniedTools ?? []);

  const serverPort = Number(process.env.MEESEEKS_PORT ?? 5174);
  const notifyBase = `http://127.0.0.1:${serverPort}/internal/runtime/${ctx.runtimeId}/notify`;
  const settingsObj: Record<string, unknown> = {
    hooks: {
      Stop: [
        {
          hooks: [{ type: 'command', command: `curl -sf "${notifyBase}?state=idle"` }],
        },
      ],
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
  const filePath = path.join(ctx.workspaceRoot, '.meeseeks', `session-${ctx.runtimeId}.json`);
  const settingsFile: SpawnSpec['settingsFile'] = {
    path: filePath,
    body: JSON.stringify(settingsObj, null, 2),
  };
  argv.push('--settings', filePath);

  for (const a of ctx.runtime?.args ?? []) argv.push(a);

  const ticketContext =
    `You are working on ticket \`${ctx.ticketRef.filename}\` in workflow ` +
    `\`${ctx.ticketRef.workflowName}\`. ` +
    `Ticket file: \`${ctx.ticketAbsPath}\`.`;
  // Most stable segment first (project context is the most cacheable), most
  // specific last. The two generated sentences sit adjacent at the end so the
  // agent reads *where* to work and *what* to work on together.
  const preamble = [
    ctx.project?.contextContent,
    ctx.processDocContent,
    ctx.project ? projectLocationSentence(ctx.project) : null,
    ticketContext,
  ]
    .filter((p): p is string => Boolean(p && p.length > 0))
    .join('\n\n');

  argv.push('--append-system-prompt', preamble);

  const inherited = { ...(process.env as Record<string, string>) };
  delete inherited.FORCE_COLOR;
  const env: Record<string, string> = {
    ...inherited,
    MEESEEKS_TICKET_PATH: ctx.ticketAbsPath,
    MEESEEKS_WORKSPACE_PATH: ctx.workspaceRoot,
    MEESEEKS_WORKFLOW_PATH: ctx.workflowPath,
    ...(ctx.project
      ? { MEESEEKS_PROJECT_ROOT: ctx.project.root, MEESEEKS_PROJECT_NAME: ctx.project.name }
      : {}),
    ...(ctx.runtime?.env ?? {}),
  };
  if (ctx.runtime?.provider) env.CLAUDE_CODE_PROVIDER = ctx.runtime.provider;

  return { argv, env, cwd: ctx.workflowPath, preamble, settingsFile };
}

export function buildPromptSpawnSpec(ctx: PromptSpawnContext): SpawnSpec {
  const argv: string[] = [HARNESS_BIN];
  argv.push('--print');
  argv.push('--output-format', 'stream-json');
  argv.push('--verbose');
  // A one-shot prompt runs with nobody at the keyboard: a permission prompt in
  // --print mode has no answerable surface, so the run would stall until it was
  // killed. Bypassing is the only mode that lets these finish unattended. It also
  // means deniedTools below stops being enforced by the harness — the settings
  // file still carries it, but treat a prompt's permissions as advisory.
  argv.push('--permission-mode', 'bypassPermissions');

  const model = ctx.model ?? ctx.runtime?.model;
  if (model) argv.push('--model', model);

  if (ctx.project) argv.push('--add-dir', ctx.project.root);

  for (const p of ctx.permissions?.allowedPaths ?? []) {
    argv.push('--add-dir', p.value);
  }

  const allowedTools = permissionValues(ctx.permissions?.allowedTools ?? []);
  const deniedTools = permissionValues(ctx.permissions?.deniedTools ?? []);
  const settingsObj: Record<string, unknown> = {};
  if (allowedTools.length > 0 || deniedTools.length > 0) {
    settingsObj.permissions = { allow: allowedTools, deny: deniedTools };
  }
  let settingsFile: SpawnSpec['settingsFile'] = null;
  if (Object.keys(settingsObj).length > 0) {
    const filePath = path.join(ctx.workspaceRoot, '.meeseeks', `prompt-${ctx.runtimeId}.json`);
    settingsFile = { path: filePath, body: JSON.stringify(settingsObj, null, 2) };
    argv.push('--settings', filePath);
  }

  // Unlike ticket runtimes, a prompt's preamble is otherwise display-only, so
  // the project segments have to be passed explicitly. Guarded on ctx.project
  // so a prompt run without one keeps its existing flagset unchanged.
  if (ctx.project) {
    const systemPrompt = [ctx.project.contextContent, projectLocationSentence(ctx.project)]
      .filter((p): p is string => Boolean(p && p.length > 0))
      .join('\n\n');
    argv.push('--append-system-prompt', systemPrompt);
  }

  for (const a of ctx.runtime?.args ?? []) argv.push(a);

  // Pass the prompt body as the positional argv argument (standard --print invocation).
  argv.push(ctx.promptBody);

  const inherited = { ...(process.env as Record<string, string>) };
  delete inherited.FORCE_COLOR;
  const env: Record<string, string> = {
    ...inherited,
    MEESEEKS_WORKSPACE_PATH: ctx.workspaceRoot,
    MEESEEKS_PROMPT_NAME: ctx.promptRef.name,
    ...(ctx.project
      ? { MEESEEKS_PROJECT_ROOT: ctx.project.root, MEESEEKS_PROJECT_NAME: ctx.project.name }
      : {}),
    ...(ctx.runtime?.env ?? {}),
  };
  if (ctx.runtime?.provider) env.CLAUDE_CODE_PROVIDER = ctx.runtime.provider;

  const preamble = [
    ctx.project?.contextContent,
    ctx.project ? projectLocationSentence(ctx.project) : null,
    `Prompt: ${ctx.promptRef.name}`,
  ]
    .filter((p): p is string => Boolean(p && p.length > 0))
    .join('\n\n');
  return { argv, env, cwd: ctx.workspaceRoot, preamble, settingsFile };
}
