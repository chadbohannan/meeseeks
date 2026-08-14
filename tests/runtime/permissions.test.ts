import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { resolvePermissions, permissionValues, type PermissionSource } from '../../src/runtime/permissions.js';
import type { PermissionsConfig } from '../../src/shared/types.js';

const PROJECT_ROOT = '/home/u/code/meeseeks';
const WORKFLOW_PATH = '/tmp/ws/boards/b/workflows/dev';

function perms(p: Partial<PermissionsConfig>): PermissionsConfig {
  return { allowedPaths: [], allowedTools: [], deniedTools: [], ...p };
}

function sources(
  project: PermissionsConfig | null,
  workflow: PermissionsConfig | null,
): PermissionSource[] {
  return [
    { origin: 'project', base: PROJECT_ROOT, config: project },
    { origin: 'workflow', base: WORKFLOW_PATH, config: workflow },
  ];
}

const values = (entries: { value: string }[]) => entries.map(e => e.value);

describe('resolvePermissions', () => {
  it('returns null when no source carries a config', () => {
    expect(resolvePermissions(sources(null, null))).toBeNull();
    expect(resolvePermissions([])).toBeNull();
  });

  // The guardrail-floor property, in both directions. This is the whole reason
  // the design unions instead of letting the project replace the workflow.
  it("keeps a workflow's deniedTools even when the project defines a full block", () => {
    const resolved = resolvePermissions(sources(
      perms({ allowedPaths: ['./vendor'], allowedTools: ['Bash', 'Write'], deniedTools: ['Fetch'] }),
      perms({ deniedTools: ['Write', 'Edit', 'Bash'] }),
    ))!;
    expect(values(resolved.deniedTools).sort()).toEqual(['Bash', 'Edit', 'Fetch', 'Write']);
  });

  it("keeps a project's deniedTools even when the workflow allows the same tool", () => {
    const resolved = resolvePermissions(sources(
      perms({ deniedTools: ['Bash'] }),
      perms({ allowedTools: ['Bash'] }),
    ))!;
    expect(values(resolved.deniedTools)).toEqual(['Bash']);
    // Both lists carry it; Claude Code resolves deny over allow natively, so
    // the union does not need to subtract it here.
    expect(values(resolved.allowedTools)).toEqual(['Bash']);
  });

  it('unions allowedTools from both sources', () => {
    const resolved = resolvePermissions(sources(
      perms({ allowedTools: ['Read'] }),
      perms({ allowedTools: ['Edit'] }),
    ))!;
    expect(values(resolved.allowedTools).sort()).toEqual(['Edit', 'Read']);
  });

  // The provenance-base test: a single union containing entries that need
  // different resolution bases. Resolving after the merge would be impossible.
  it('resolves each source\'s relative paths against its own base', () => {
    const resolved = resolvePermissions(sources(
      perms({ allowedPaths: ['./vendor'] }),
      perms({ allowedPaths: ['../shared'] }),
    ))!;
    expect(values(resolved.allowedPaths)).toEqual([
      path.resolve(PROJECT_ROOT, './vendor'),
      path.resolve(WORKFLOW_PATH, '../shared'),
    ]);
  });

  it('expands ~ for both sources and leaves absolute paths alone', () => {
    const resolved = resolvePermissions(sources(
      perms({ allowedPaths: ['~/proj-notes'] }),
      perms({ allowedPaths: ['~/workflow-notes', '/opt/tools'] }),
    ))!;
    expect(values(resolved.allowedPaths)).toEqual([
      path.join(os.homedir(), 'proj-notes'),
      path.join(os.homedir(), 'workflow-notes'),
      '/opt/tools',
    ]);
  });

  it('de-duplicates a shared value and records both origins', () => {
    const resolved = resolvePermissions(sources(
      perms({ allowedTools: ['Read'], deniedTools: ['Write'] }),
      perms({ allowedTools: ['Read'], deniedTools: ['Write'] }),
    ))!;
    expect(resolved.allowedTools).toHaveLength(1);
    expect(resolved.allowedTools[0]!.origins).toEqual(['project', 'workflow']);
    expect(resolved.deniedTools[0]!.origins).toEqual(['project', 'workflow']);
  });

  it('de-duplicates paths that resolve to the same absolute location', () => {
    const resolved = resolvePermissions(sources(
      perms({ allowedPaths: ['/opt/shared'] }),
      perms({ allowedPaths: ['/opt/shared'] }),
    ))!;
    expect(resolved.allowedPaths).toHaveLength(1);
    expect(resolved.allowedPaths[0]!.origins).toEqual(['project', 'workflow']);
  });

  it('tags single-source entries with only that origin', () => {
    const resolved = resolvePermissions(sources(null, perms({ allowedTools: ['Edit'] })))!;
    expect(resolved.allowedTools[0]!.origins).toEqual(['workflow']);
  });

  it('works with a workflow-only source, preserving pre-project behavior', () => {
    const resolved = resolvePermissions(sources(
      null,
      perms({ allowedPaths: ['../my-repo'], allowedTools: ['Bash'], deniedTools: ['Write'] }),
    ))!;
    expect(values(resolved.allowedPaths)).toEqual([path.resolve(WORKFLOW_PATH, '../my-repo')]);
    expect(values(resolved.allowedTools)).toEqual(['Bash']);
    expect(values(resolved.deniedTools)).toEqual(['Write']);
  });

  it('returns empty lists (not null) when a source exists but is empty', () => {
    const resolved = resolvePermissions(sources(null, perms({})));
    expect(resolved).not.toBeNull();
    expect(resolved!.allowedTools).toEqual([]);
  });
});

describe('permissionValues', () => {
  it('flattens entries to plain strings', () => {
    expect(permissionValues([
      { value: 'Bash', origins: ['workflow'] },
      { value: 'Edit', origins: ['project', 'workflow'] },
    ])).toEqual(['Bash', 'Edit']);
  });
});
