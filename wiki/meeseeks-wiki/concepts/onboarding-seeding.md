# Onboarding Seeding

A new workspace used to arrive empty. The board era seeded a Development lane with a
filled-in process document, and the [board-to-workflow collapse](../runbooks/board-to-workflow-migration.md)
orphaned that code without anyone noticing: three of the four exports in
`src/storage/templates.ts` lost their last importer, leaving only the generator that
emits fill-in-the-blank prompts. First run was therefore *worse* after the collapse
than before it. Restoring it is a regression fix, which is why it ships ahead of the
detection and cloning tiers described in the
[onboarding seeding design](../../../docs/superpowers/specs/2026-08-14-onboarding-seeding-design.md).

Seeding writes starting values into a config the user is creating. It is not detection —
nothing here reads a codebase, and nothing here infers. Everything seeded comes from
curated templates versioned in the repo.

## Where seeding hooks in

There is no `createWorkspace`. A workspace comes into being as a side effect of being
read: `readWorkspace` (`src/storage/workspace.ts`) writes a default `workspace.yaml`
when it finds none. That auto-create branch is the only moment in the system that
constitutes first contact with a workspace, so `ensureWorkspaceSeeded`
(`src/storage/seed.ts`) is called from there and nowhere else. `readWorkspace` runs on
nearly every request; seeding unconditionally would mean re-checking the workspace
shape on every one of them.

Three constraints shape that call site, and each was a decision rather than an accident:

**The import is dynamic.** `seed.ts` imports `createWorkflow`, which imports
`workspace.ts` — a module cycle that would otherwise have to resolve at load time.
`await import('./seed.js')` inside the cold branch defers it to a path that runs once
per workspace, where the cost of a dynamic import is irrelevant.

**Failure is swallowed, not thrown.** Seeding runs inside what every caller experiences
as a read. A workspace that fails to seed must still open — empty is a working state,
unopenable is not — so the branch logs and falls through to the unseeded config.

**Seeding goes through `createWorkflow`.** The same function the UI calls, so there is a
single code path producing workflow structure on disk. The seeded workflow is an
ordinary workflow: nothing in storage records that it was seeded, because that
distinction would have to be maintained forever to serve one first-session affordance.

Idempotence comes from the registry rather than a flag: `ensureWorkspaceSeeded` returns
early when `workflows:` is non-empty. A user who deletes the starter workflow does not
get it back, and a `workspace.yaml` that already exists never reaches the branch at all.

## Why the starter permissions are curated, not scraped

Auditing this repo's own workspace — the most mature one in existence — found two
useful rows out of eight. Both carried their knowledge in machine-specific form: every
permission entry was absolute to `/home/chad/workspace/meeseeks/**`, and the one
runtime block named a model that no longer exists. Harvesting a workspace also runs
circular, since its `PROCESS.md` is verbatim the output of `workflowProcessTemplate()`.

`STARTER_PERMISSIONS` is what survived curation: read access to the project root, with
a `{root}` placeholder resolved by `starterPermissions(root)` at write time. The
ecosystem-specific grants that workspace carried — `npm test`, `npm run typecheck` —
are deliberately absent, because detection can propose those from what a repository
actually *declares* rather than from names Meeseeks expects to find.

Write and Edit are absent for a different reason. Granting read access to a repository
and granting write access to it are different decisions, and only the first is implied
by the act of registering it. The same asymmetry governs detection, where Write and
Edit proposals arrive unselected.

`createProject` applies the starter set only when the caller supplies no `permissions`
at all; a caller that supplies its own — including an empty block — overrides it
entirely. This is seeding, not detection, so it may write without a review step: the
value is a fixed template rather than an inference about the user's machine. A blank
default would be no safer, only less useful.

## References

| Fact | Source |
| --- | --- |
| Seeding seam and swallowed failure | `src/storage/workspace.ts`, auto-create branch |
| Idempotence via the registry | `src/storage/seed.ts` |
| Starter templates and `{root}` placeholder | `src/storage/templates.ts` |
| Starter set applied on project create | `src/storage/project.ts`, `createProject` |
| Workspace audit (8 sources, 2 useful) | [Onboarding Seeding design](../../../docs/superpowers/specs/2026-08-14-onboarding-seeding-design.md) |
