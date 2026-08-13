import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildSpawnSpec } from '../../src/runtime/claude-code.js';

const ticketRef = { boardId: 'b', laneName: 'l', filename: '2026-04-26T1430-x.md' };

function addDirsOf(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--add-dir') out.push(argv[i + 1]!);
  }
  return out;
}

describe('buildSpawnSpec', () => {
  it('produces minimal argv when board.yaml and permissions.yaml are absent', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/tmp/p/boards/b/lanes/l/todo/2026-04-26T1430-x.md',
      ticketRef,
      board: null,
      permissions: null,
    });
    expect(path.basename(spec.argv[0]!)).toBe('claude');
    expect(spec.argv).toContain('--verbose');
    expect(spec.argv).not.toContain('--output-format');
    expect(spec.argv).not.toContain('--input-format');
    expect(spec.argv.filter(a => a === '--add-dir')).toHaveLength(0);
    expect(spec.settingsFile).not.toBeNull();
    expect(spec.argv).toContain('--settings');
    const body = JSON.parse(spec.settingsFile!.body) as { hooks: { Notification: Array<{ matcher: string }> } };
    expect(body.hooks.Notification.map(h => h.matcher)).toContain('idle_prompt');
    expect(body.hooks.Notification.map(h => h.matcher)).toContain('permission_prompt');
    expect(spec.env.MEESEEKS_TICKET_PATH).toBe('/tmp/p/boards/b/lanes/l/todo/2026-04-26T1430-x.md');
    expect(spec.env.MEESEEKS_BOARD_PATH).toBe('/tmp/p/boards/b');
    expect(spec.env.MEESEEKS_LANE_PATH).toBe('/tmp/p/boards/b/lanes/l');
    expect(spec.cwd).toBe('/tmp/p/boards/b');
  });

  // Path resolution itself now lives in resolvePermissions (which knows each
  // source's base); the adapter emits the already-absolute values verbatim.
  it('translates resolved allowedPaths to repeated --add-dir flags', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      board: null,
      permissions: {
        allowedPaths: [
          { value: '/tmp/p/my-repo', origins: ['lane'] },
          { value: path.join(os.homedir(), 'notes'), origins: ['project'] },
        ],
        allowedTools: [],
        deniedTools: [],
      },
    });
    expect(addDirsOf(spec.argv)).toEqual(['/tmp/p/my-repo', path.join(os.homedir(), 'notes')]);
  });

  it('adds the project root as --add-dir and keeps cwd on the board', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-p',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      ticketRef,
      board: null,
      permissions: null,
      project: { projectId: 'meeseeks', name: 'Meeseeks', root: '/home/u/code/meeseeks', contextContent: null },
    });
    expect(addDirsOf(spec.argv)).toEqual(['/home/u/code/meeseeks']);
    // cwd deliberately stays on the board so its .claude/ and symlinks resolve.
    expect(spec.cwd).toBe('/tmp/p/boards/b');
    expect(spec.env.MEESEEKS_PROJECT_ROOT).toBe('/home/u/code/meeseeks');
    expect(spec.env.MEESEEKS_PROJECT_NAME).toBe('Meeseeks');
  });

  it('omits project env vars and --add-dir when no project is assigned', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-np',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      ticketRef,
      board: null,
      permissions: null,
      project: null,
    });
    expect(addDirsOf(spec.argv)).toEqual([]);
    expect(spec.env.MEESEEKS_PROJECT_ROOT).toBeUndefined();
    expect(spec.env.MEESEEKS_PROJECT_NAME).toBeUndefined();
  });

  it('writes a settings file body containing allow/deny tool rules', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-7',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      board: null,
      permissions: {
        allowedPaths: [],
        allowedTools: [
          { value: 'Bash', origins: ['lane'] },
          { value: 'Edit', origins: ['project'] },
        ],
        deniedTools: [{ value: 'Write', origins: ['lane', 'project'] }],
      },
    });
    expect(spec.settingsFile).not.toBeNull();
    expect(spec.settingsFile!.path).toMatch(/\.meeseeks\/session-rt-7\.json$/);
    const body = JSON.parse(spec.settingsFile!.body) as { permissions: { allow: string[]; deny: string[] }; hooks: unknown };
    expect(body.permissions.allow).toEqual(['Bash', 'Edit']);
    expect(body.permissions.deny).toEqual(['Write']);
    expect(body.hooks).toBeDefined();
    expect(spec.argv).toContain('--settings');
    expect(spec.argv).toContain(spec.settingsFile!.path);
  });

  it('merges board.yaml runtime.args / env / model into argv + env', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      board: {
        runtime: {
          harness: 'claude-code',
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          args: ['--debug'],
          env: { FOO: 'bar' },
        },
      },
      permissions: null,
    });
    expect(spec.argv).toContain('--model');
    expect(spec.argv).toContain('claude-opus-4-7');
    expect(spec.argv).toContain('--debug');
    expect(spec.env.FOO).toBe('bar');
  });

  it('includes preamble in returned object', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/my-board',
      lanePath: '/tmp/p/boards/my-board/lanes/dev',
      ticketAbsPath: '/tmp/p/boards/my-board/lanes/dev/todo/2026-04-26T1430-x.md',
      processDocContent: '# Development Process\n\nFollow TDD methodology.',
      ticketRef: { boardId: 'my-board', laneName: 'dev', filename: '2026-04-26T1430-x.md' },
      board: null,
      permissions: null,
    });
    expect(spec.preamble).toContain('2026-04-26T1430-x.md');
    expect(spec.preamble).toContain('dev');
    expect(spec.preamble).toContain('my-board');
    expect(spec.preamble).toContain('Follow TDD methodology');
  });

  it('orders preamble parts: board context, then process doc, then ticket context', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-2',
      boardPath: '/tmp/p/boards/my-board',
      lanePath: '/tmp/p/boards/my-board/lanes/dev',
      ticketAbsPath: '/tmp/p/boards/my-board/lanes/dev/todo/t.md',
      boardContextContent: '# Board Context\n\nBOARD_MARKER',
      processDocContent: '# Process\n\nPROCESS_MARKER',
      ticketRef: { boardId: 'my-board', laneName: 'dev', filename: 't.md' },
      board: null,
      permissions: null,
    });
    const boardIdx = spec.preamble.indexOf('BOARD_MARKER');
    const processIdx = spec.preamble.indexOf('PROCESS_MARKER');
    const ticketIdx = spec.preamble.indexOf('You are working on ticket');
    expect(boardIdx).toBeGreaterThanOrEqual(0);
    expect(processIdx).toBeGreaterThan(boardIdx);
    expect(ticketIdx).toBeGreaterThan(processIdx);
  });

  it('orders preamble: project context, board, process, project location, ticket', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-4',
      boardPath: '/tmp/p/boards/my-board',
      lanePath: '/tmp/p/boards/my-board/lanes/dev',
      ticketAbsPath: '/tmp/p/boards/my-board/lanes/dev/todo/t.md',
      boardContextContent: 'BOARD_MARKER',
      processDocContent: 'PROCESS_MARKER',
      ticketRef: { boardId: 'my-board', laneName: 'dev', filename: 't.md' },
      board: null,
      permissions: null,
      project: {
        projectId: 'meeseeks',
        name: 'Meeseeks',
        root: '/home/u/code/meeseeks',
        contextContent: 'PROJECT_MARKER',
      },
    });
    const projectIdx = spec.preamble.indexOf('PROJECT_MARKER');
    const boardIdx = spec.preamble.indexOf('BOARD_MARKER');
    const processIdx = spec.preamble.indexOf('PROCESS_MARKER');
    const locationIdx = spec.preamble.indexOf('is rooted at');
    const ticketIdx = spec.preamble.indexOf('You are working on ticket');
    expect(projectIdx).toBe(0);
    expect(boardIdx).toBeGreaterThan(projectIdx);
    expect(processIdx).toBeGreaterThan(boardIdx);
    expect(locationIdx).toBeGreaterThan(processIdx);
    expect(ticketIdx).toBeGreaterThan(locationIdx);
    expect(spec.preamble).toContain('/home/u/code/meeseeks');
  });

  it('omits empty parts when only board context is present', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-3',
      boardPath: '/tmp/p/boards/my-board',
      lanePath: '/tmp/p/boards/my-board/lanes/dev',
      ticketAbsPath: '/tmp/p/boards/my-board/lanes/dev/todo/t.md',
      boardContextContent: 'BOARD_ONLY',
      processDocContent: null,
      ticketRef: { boardId: 'my-board', laneName: 'dev', filename: 't.md' },
      board: null,
      permissions: null,
    });
    expect(spec.preamble.startsWith('BOARD_ONLY')).toBe(true);
    expect(spec.preamble).not.toContain('\n\n\n');
  });
});
