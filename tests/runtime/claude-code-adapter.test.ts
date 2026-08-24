import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { buildSpawnSpec } from '../../src/runtime/claude-code.js';

const ticketRef = { workflowName: 'l', filename: '2026-04-26T1430-x.md' };

function addDirsOf(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--add-dir') out.push(argv[i + 1]!);
  }
  return out;
}

describe('buildSpawnSpec', () => {
  it('produces minimal argv when no runtime block and no permissions are present', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/l',
      ticketAbsPath: '/tmp/ws/workflows/l/todo/2026-04-26T1430-x.md',
      ticketRef,
      runtime: null,
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
    expect(spec.env.MEESEEKS_TICKET_PATH).toBe('/tmp/ws/workflows/l/todo/2026-04-26T1430-x.md');
    expect(spec.env.MEESEEKS_WORKSPACE_PATH).toBe('/tmp/ws');
    expect(spec.env.MEESEEKS_WORKFLOW_PATH).toBe('/tmp/ws/workflows/l');
    expect(spec.cwd).toBe('/tmp/ws/workflows/l');
  });

  // Path resolution itself now lives in resolvePermissions (which knows each
  // source's base); the adapter emits the already-absolute values verbatim.
  it('translates resolved allowedPaths to repeated --add-dir flags', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      runtime: null,
      permissions: {
        allowedPaths: [
          { value: '/tmp/p/my-repo', origins: ['workflow'] },
          { value: path.join(os.homedir(), 'notes'), origins: ['project'] },
        ],
        allowedTools: [],
        deniedTools: [],
      },
    });
    expect(addDirsOf(spec.argv)).toEqual(['/tmp/p/my-repo', path.join(os.homedir(), 'notes')]);
  });

  it('adds the project root as --add-dir and sets cwd to the workflow directory', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-p',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/l',
      ticketAbsPath: '/x.md',
      ticketRef,
      runtime: null,
      permissions: null,
      project: { projectId: 'meeseeks', name: 'Meeseeks', root: '/home/u/code/meeseeks', contextContent: null },
    });
    expect(addDirsOf(spec.argv)).toEqual(['/home/u/code/meeseeks']);
    expect(spec.cwd).toBe('/tmp/ws/workflows/l');
    expect(spec.env.MEESEEKS_PROJECT_ROOT).toBe('/home/u/code/meeseeks');
    expect(spec.env.MEESEEKS_PROJECT_NAME).toBe('Meeseeks');
  });

  it('omits project env vars and --add-dir when no project is assigned', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-np',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/l',
      ticketAbsPath: '/x.md',
      ticketRef,
      runtime: null,
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
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      runtime: null,
      permissions: {
        allowedPaths: [],
        allowedTools: [
          { value: 'Bash', origins: ['workflow'] },
          { value: 'Edit', origins: ['project'] },
        ],
        deniedTools: [{ value: 'Write', origins: ['workflow', 'project'] }],
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

  it('merges the resolved runtime args / env / model into argv + env', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-1',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/l',
      ticketAbsPath: '/x.md',
      processDocContent: null,
      ticketRef,
      runtime: {
        harness: 'claude-code',
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        args: ['--debug'],
        env: { FOO: 'bar' },
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
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/dev',
      ticketAbsPath: '/tmp/ws/workflows/dev/todo/2026-04-26T1430-x.md',
      processDocContent: '# Development Process\n\nFollow TDD methodology.',
      ticketRef: { workflowName: 'dev', filename: '2026-04-26T1430-x.md' },
      runtime: null,
      permissions: null,
    });
    expect(spec.preamble).toContain('2026-04-26T1430-x.md');
    expect(spec.preamble).toContain('dev');
    expect(spec.preamble).toContain('Follow TDD methodology');
  });

  it('orders preamble parts: process doc, then ticket context', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-2',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/dev',
      ticketAbsPath: '/tmp/ws/workflows/dev/todo/t.md',
      processDocContent: '# Process\n\nPROCESS_MARKER',
      ticketRef: { workflowName: 'dev', filename: 't.md' },
      runtime: null,
      permissions: null,
    });
    const processIdx = spec.preamble.indexOf('PROCESS_MARKER');
    const ticketIdx = spec.preamble.indexOf('You are working on ticket');
    expect(processIdx).toBeGreaterThanOrEqual(0);
    expect(ticketIdx).toBeGreaterThan(processIdx);
  });

  it('sets cwd to the workflow directory', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-2b',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/dev',
      ticketAbsPath: '/tmp/ws/workflows/dev/todo/t.md',
      processDocContent: null,
      ticketRef: { workflowName: 'dev', filename: 't.md' },
      runtime: null,
      permissions: null,
    });
    expect(spec.cwd).toBe('/tmp/ws/workflows/dev');
  });

  it('orders preamble: project context, process doc, project location, ticket', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-4',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/dev',
      ticketAbsPath: '/tmp/ws/workflows/dev/todo/t.md',
      processDocContent: 'PROCESS_MARKER',
      ticketRef: { workflowName: 'dev', filename: 't.md' },
      runtime: null,
      permissions: null,
      project: {
        projectId: 'meeseeks',
        name: 'Meeseeks',
        root: '/home/u/code/meeseeks',
        contextContent: 'PROJECT_MARKER',
      },
    });
    const projectIdx = spec.preamble.indexOf('PROJECT_MARKER');
    const processIdx = spec.preamble.indexOf('PROCESS_MARKER');
    const locationIdx = spec.preamble.indexOf('is rooted at');
    const ticketIdx = spec.preamble.indexOf('You are working on ticket');
    expect(projectIdx).toBe(0);
    expect(processIdx).toBeGreaterThan(projectIdx);
    expect(locationIdx).toBeGreaterThan(processIdx);
    expect(ticketIdx).toBeGreaterThan(locationIdx);
    expect(spec.preamble).toContain('/home/u/code/meeseeks');
  });

  it('omits empty parts when only the process doc is present', () => {
    const spec = buildSpawnSpec({
      runtimeId: 'rt-3',
      workspaceRoot: '/tmp/ws',
      workflowPath: '/tmp/ws/workflows/dev',
      ticketAbsPath: '/tmp/ws/workflows/dev/todo/t.md',
      processDocContent: 'PROCESS_ONLY',
      ticketRef: { workflowName: 'dev', filename: 't.md' },
      runtime: null,
      permissions: null,
    });
    expect(spec.preamble.startsWith('PROCESS_ONLY')).toBe(true);
    expect(spec.preamble).not.toContain('\n\n\n');
  });
});
