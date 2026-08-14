/**
 * CLI for the board-era -> workspace migration.
 *
 *   npm run migrate -- --dry-run
 *   npm run migrate -- /path/to/workspace --project-root ~/code/thing
 *
 * Defaults to a dry run's caution in one respect only: it prints the full
 * report either way, so what happened is visible rather than inferred from a
 * later failure.
 */
import { migrateWorkspace, type MigrationReport } from '../src/storage/migrate.js';

function parseArgs(argv: string[]) {
  let workspaceRoot = process.cwd();
  let dryRun = false;
  let projectRoot: string | undefined;
  let seenPositional = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--dry-run' || arg === '-n') { dryRun = true; continue; }
    if (arg === '--project-root') {
      const next = argv[++i];
      if (!next) throw new Error('--project-root requires a path');
      projectRoot = next;
      continue;
    }
    if (arg === '--help' || arg === '-h') { usage(); process.exit(0); }
    if (arg.startsWith('-')) throw new Error(`unknown flag: ${arg}`);
    if (seenPositional) throw new Error(`unexpected argument: ${arg}`);
    workspaceRoot = arg;
    seenPositional = true;
  }
  return { workspaceRoot, dryRun, projectRoot };
}

function usage(): void {
  console.log(`Usage: npm run migrate -- [workspace] [options]

Migrates a board-era workspace (project.yaml + boards/) to the workspace
layout (workspace.yaml + workflows/ + projects/). Originals are renamed with
a .pre-migrate suffix rather than deleted.

Arguments:
  workspace              Workspace root (default: current directory)

Options:
  -n, --dry-run          Report the plan and write nothing
      --project-root P   Codebase root for the generated project config
                         (default: the workspace root)
  -h, --help             Show this help`);
}

function section(title: string, lines: string[]): void {
  if (lines.length === 0) return;
  console.log(`\n${title}`);
  for (const l of lines) console.log(`  ${l}`);
}

function print(report: MigrationReport): void {
  if (!report.migrated) {
    console.log(report.notes.join('\n'));
    return;
  }
  console.log(
    `${report.dryRun ? 'Would migrate' : 'Migrated'} ${report.workspaceRoot}`,
  );

  section('Workflows', report.workflows.map(w => {
    const bits = [w.entry];
    if (w.suffixed) bits.push('(renamed — name was taken)');
    if (w.runtimeCopied) bits.push('+runtime');
    if (w.ticketsTagged) bits.push(`${w.ticketsTagged} ticket(s) tagged`);
    return `${w.from}  ->  ${bits.join(' ')}`;
  }));

  section('Project', report.projectConfig
    ? [`${report.projectConfig}${report.grantsFolded ? ` (${report.grantsFolded} grant(s) folded in)` : ''}`]
    : []);

  section('Symlinks rewritten to absolute', report.symlinksRewritten.map(
    s => `${s.at}: ${s.from} -> ${s.to}`,
  ));

  section('Backups', report.backups);

  // The three things below need a human. They are printed last so they are
  // what is still on screen when the command finishes.
  section('Collisions (not resolved)', report.collisions);
  section('Still referencing MEESEEKS_LANE_PATH (now MEESEEKS_WORKFLOW_PATH)', report.laneEnvRefs);
  section('Notes', report.notes);

  if (report.dryRun) {
    console.log('\nNothing was written. Re-run without --dry-run to apply.');
  }
}

async function main(): Promise<void> {
  const { workspaceRoot, dryRun, projectRoot } = parseArgs(process.argv.slice(2));
  print(await migrateWorkspace(workspaceRoot, { dryRun, projectRoot }));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
