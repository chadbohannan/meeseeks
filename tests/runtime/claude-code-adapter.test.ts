import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildSpawnSpec } from '../../src/runtime/claude-code.js';

const ticketRef = { boardId: 'b', laneName: 'l', filename: '2026-04-26T1430-x.md' };

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

  it('translates allowedPaths to repeated --add-dir flags resolved against lane', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      boardPath: '/tmp/p/boards/b',
      lanePath: '/tmp/p/boards/b/lanes/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      board: null,
      permissions: { allowedPaths: ['../my-repo', '~/notes'], allowedTools: [], deniedTools: [] },
    });
    const addDirs: string[] = [];
    for (let i = 0; i < spec.argv.length; i++) {
      if (spec.argv[i] === '--add-dir') addDirs.push(spec.argv[i + 1]!);
    }
    expect(addDirs).toContain(path.resolve('/tmp/p/boards/b/lanes/l', '../my-repo'));
    expect(addDirs).toContain(path.join(os.homedir(), 'notes'));
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
      permissions: { allowedPaths: [], allowedTools: ['Bash', 'Edit'], deniedTools: ['Write'] },
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
