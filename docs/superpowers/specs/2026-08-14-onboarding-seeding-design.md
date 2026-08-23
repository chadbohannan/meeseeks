# Meeseeks — Onboarding Seeding

**Date:** 2026-08-14
**Status:** Phases 1–2 implemented 2026-08-23; phases 3–4 (UI) not started
**Follows:** [Collapsing Boards into Workflows](2026-08-13-workflow-collapse-design.md)
**Supersedes:** [Onboarding Defaults](2026-06-09-onboarding-defaults-design.md)

## Overview

A multi-agent harness is a complicated thing to stand up. Before a user can start a single agent they must choose a workflow's states, write a process document the agent will actually read, register a codebase, and get permissions tight enough that the agent is not stopping to ask about `npm test`. Today Meeseeks helps with exactly one of those four, and the workflow collapse silently removed the help it used to give on a second.

This change gives new workflows and new projects **usable starting values**, drawn from three sources of increasing specificity:

1. **Ship** — curated static templates, versioned in the repo.
2. **Detect** — values inferred from the project root the user is registering.
3. **Clone** — values copied from a workflow or project that already exists in this workspace.

The governing constraint is that a seeded value is a **proposal, not a fact**: it is labelled with where it came from and is editable before anything is written to disk.

> **Terminology.** *Seeding* is writing starting values into a config the user is creating. *Detection* is reading a codebase to propose those values. Detection never writes; seeding writes only what the user accepted.

## Motivation

### The blank slate is now blanker than it was in June

The June spec fixed a real blank-slate problem: `createBoard` seeded a Development lane with a filled-in four-state `PROCESS.md`. That code shipped, and it is still in the tree — but the workflow collapse orphaned it. `STARTER_WORKFLOW`, `STARTER_WORKFLOW_PROCESS`, and `boardContextTemplate` in `src/storage/templates.ts` now have **no importers**; only `workflowProcessTemplate` survives, and it is the one that emits fill-in-the-blank prompts rather than content.

Meanwhile `readWorkspace` (`src/storage/workspace.ts:102`) auto-creates `{ name, workflows: [], projects: [] }`. Nothing else runs on first contact with a workspace. There is no `createWorkspace` seam at all — a workspace comes into being as a side effect of being read.

So the current first-run experience is strictly worse than it was before the collapse: an empty workspace, no workflows, and any workflow the user creates gets a stub. Restoring this is a regression fix, not a feature, and it is separated into its own phase for that reason.

### Where the real knowledge actually is

The premise worth testing is whether an existing mature workspace is a good source of defaults. Auditing this repo's own workspace — the most mature one that exists — says mostly no:

| Source | Content | Value as a seed |
| --- | --- | --- |
| `workflows/development/workflow.yaml` | todo / in-progress / done | none — already `DEFAULT_STATES` in the UI |
| `workflows/development/PROCESS.md` | *"Describe when a ticket enters this state…"* | none — unfilled template output |
| `workflows/development/permissions.yaml` | three empty arrays | none |
| `.claude/skills/` | empty | none |
| `prompts/` | one line, containing a typo | none |
| `board.yaml` `runtime:` | `model: claude-opus-4-7` | **negative** — model no longer exists |
| `.claude/settings.json` | 15 real permission entries | **high** |
| `.claude/bin/code-rag.sh` | 7.7 KB MCP shim | **high** |

Two rows out of eight carry anything, and the corpus is n=1.

### Why scraping the workspace is rejected

Three findings, each sufficient on its own:

**It is circular.** `workflows/development/PROCESS.md` is verbatim the output of `workflowProcessTemplate()`. The workspace is downstream of the template system, not upstream of it. Harvesting it would feed a template its own unfilled output and re-present it as experience.

**It propagates staleness with authority.** The two rows that *do* carry knowledge carry it in a machine-specific form: every permission entry is absolute to `/home/chad/workspace/meeseeks/**`, and the one runtime block names a model that no longer exists. A blank field prompts a decision; a plausible wrong default gets accepted without one. Seeding from unfiltered real data optimises for the wrong failure.

**It does not scale.** A scraper's quality is bounded by one workspace that happens to be at hand. Detection's quality grows with every project the user registers.

What survives from the idea is the narrow, honest case: when a workspace *already has* a configured workflow, copying from it is useful and needs no inference at all. That is tier 3.

### Why repo introspection reopens now

The June spec listed "no repo introspection" as an explicit non-goal. That was correct **at the time and for a reason that has since expired**: in the board era there was no declared codebase to introspect. A board *was* the working directory; nothing in the model pointed at a repository, so introspection would have meant guessing at the board folder's surroundings.

The project refactor created exactly the missing thing. `ProjectConfig.root` is an absolute path to a codebase, validated on the way in and deliberately exempted from `resolveWithin` because pointing outside the workspace is the whole point of the type (`src/storage/project.ts:19`). Introspection now has a first-class, user-supplied subject. The non-goal is lifted because its premise was removed, not because the tradeoff was re-argued.

## Decisions

| Question | Decision |
| --- | --- |
| Seed source of record | Curated templates in `src/storage/templates.ts`, not scraped workspaces |
| Detection subject | The registered project's `root` — never a sibling workspace |
| Detection timing | On demand during project create/edit; never on a schedule, never at spawn |
| Detection output | A reviewable proposal list; writes only what the user accepts |
| Provenance | Every seeded value carries its source and is editable pre-write |
| Clone scope | `runtime` and `permissions` only — never states, name, or `PROCESS.md` |
| Workspace first-run | New seam; `readWorkspace` keeps its auto-create behaviour |

### Why provenance is the unifying constraint

This codebase already refuses to present a value without saying where it came from. `WorkflowDetail.runtimeInherited` exists solely so the runtime editor can distinguish *"Inherited from the workspace default"* (blue) from *"Defined by this workflow"* (grey) — two states that are otherwise byte-identical on screen. The permission resolver carries provenance per source rather than flattening to a merged list. The sidebar shows an amber `!` for a workflow that is registered but missing rather than hiding it.

A seeded value is the same category of thing: something the user did not type. It gets the same treatment. This is not a new principle introduced by this change; it is the existing one extended to cover a third kind of untyped value.

The practical consequence is that **detection never writes silently.** Proposals arrive as a checklist. An unreviewed permission grant is a security-relevant default, and the difference between "Meeseeks noticed your repo has a package.json and suggests allowing `npm test`" and "Meeseeks granted `npm test`" is the difference between a helpful tool and one the user stops trusting.

### Why cloning excludes states and PROCESS.md

Copying a runtime block or a permission set is copying *configuration*. Copying states and their process document is copying *content* — and it produces a second workflow that is a duplicate of the first, including the parts the user had not gotten around to writing. The user asked for a new workflow because they wanted a different process. Tier 1 gives them a good starting process; tier 3 spares them re-typing a model id.

## Scope

### In scope

- Restore workspace and workflow seeding against the workspace model (regression).
- A `detect` module that reads a project root and proposes build commands, permission entries, and context.
- Import of an existing `.claude/settings.json` found at a project root.
- A "copy configuration from…" affordance on workflow and project creation.
- Provenance labelling in the UI for every seeded or detected value.

### Out of scope

- AI-assisted drafting of process documents. Detection is deterministic file inspection only.
- Re-detecting on a watch or a timer. Detection runs when the user asks.
- Archetype pickers beyond the single starter workflow (deferred again, from June).
- Migration of the existing workspace — that is the workflow-collapse spec's Phase 4 and lands first.

### Why detection is deterministic only

An LLM pass over a repository would produce better prose than a file-existence check, and it would produce it non-reproducibly, at a cost, with a network dependency, at the exact moment a new user is deciding whether this tool works. Deterministic detection is testable, instant, offline, and explainable in one line of UI text — *"proposed because `package.json` has a `test` script."* That sentence is what makes the proposal reviewable, and an LLM-authored suggestion cannot produce it.

## Section 1: Tier 1 — Ship

### Workspace first run

Add `ensureWorkspaceSeeded(workspaceRoot)`, called once when `readWorkspace` takes its auto-create branch. It creates the starter workflow via `createWorkflow` — the same path the UI uses, so there is one code path producing workflow structure on disk — passing `STARTER_WORKFLOW_PROCESS` as `processDoc`.

`readWorkspace` itself is not changed to seed unconditionally: it is called on nearly every request, and seeding belongs to the one call that discovers no config file exists.

### Template revival

`src/storage/templates.ts` is updated for the workspace model:

- `STARTER_WORKFLOW` — keep. States Todo → In Progress → Review → Done.
- `STARTER_WORKFLOW_PROCESS` — keep, unchanged.
- `boardContextTemplate` — **delete.** `CONTEXT.md` folded into `PROCESS.md`; the concept no longer exists.
- `workflowProcessTemplate` — keep. It is correct for a user-defined state list.
- The module docstring's "seeded into every new board" is rewritten; it currently documents a thing that no longer happens.

### Starter permission set

New export `STARTER_PERMISSIONS`: the generalised form of what this repo's `.claude/settings.json` learned, with machine-specific paths replaced by a `{root}` placeholder resolved against `ProjectConfig.root` at write time. This is the one place the audited workspace legitimately informs a default — passed through curation rather than scraped.

## Section 2: Tier 2 — Detect

### Interface

```ts
export interface Detection {
  kind: 'permission' | 'context' | 'runtime';
  value: string;
  reason: string;      // "package.json declares a `test` script"
  evidence: string;    // repo-relative path that justified it
  preselected: boolean;
}

export async function detectProjectDefaults(root: string): Promise<Detection[]>;
```

`reason` and `evidence` are not decoration — they are what makes a proposal reviewable, and they are required fields for that reason.

### Detectors

| Evidence | Proposes | Preselected |
| --- | --- | --- |
| `package.json` scripts | `Bash(npm run <script> *)` per script matching test/lint/typecheck/build | yes |
| `Cargo.toml` | `Bash(cargo test *)`, `Bash(cargo check *)` | yes |
| `pyproject.toml` / `setup.py` | `Bash(pytest *)` | yes |
| `Makefile` targets | `Bash(make <target> *)` for test/lint/build | yes |
| `go.mod` | `Bash(go test *)`, `Bash(go build *)` | yes |
| always | `Read({root}/**)` | yes |
| top-level source dirs | `Write`/`Edit` per directory | **no** |
| `CLAUDE.md` / `AGENTS.md` | `contextFile` pointing at it | yes |
| `.claude/settings.json` | its `permissions.allow` entries verbatim | yes |

Write and Edit grants are proposed **unselected**. Read access to a repository and write access to it are different decisions, and defaulting the second one on would make the checklist a formality.

Detection is read-only, tolerates unreadable and malformed files by skipping them, and returns `[]` for a root that does not exist rather than throwing — an unavailable project root is already a represented state (`ProjectSummary.available`).

### Wiring

`POST /api/projects/detect` with `{ root }` returns `{ detections }`. It is a separate endpoint rather than a side effect of `createProject` because it runs *before* the project exists — the user is still typing the path — and because it must be re-runnable against an existing project without mutating it.

## Section 3: Tier 3 — Clone

`NewWorkflowModal` gains a "Copy configuration from" select listing existing workflows, defaulting to none. Choosing one copies `runtime` and `permissions` into the create request. The new project form gets the same affordance over existing projects, copying `permissions` and `color`.

No new storage surface: `createWorkflow` already accepts `runtime`, and `CreateProjectInput` already accepts `permissions`. This tier is a UI change over existing capability.

## Section 4: Web UI

A shared `<SeededValue>` wrapper renders a proposed value with its `reason` on hover and a control to accept or dismiss, matching the existing inherited-runtime treatment in `WorkflowEditorRoute`. The project form gains a "Detect from repository" button that populates a checklist; nothing is written until save.

The starter workflow created on first run is a **normal workflow** with no special marking. It is fully editable and deletable through the existing editor, and nothing in storage records that it was seeded — a distinction that would have to be maintained forever to serve a first-session affordance.

## Section 5: Phasing

1. **Regression fix** — revive templates against the workspace model, add `ensureWorkspaceSeeded`, delete `boardContextTemplate`. Ships alone; it is a bug fix and should not wait on the feature.
2. **Detection module** — `detect.ts` plus the endpoint, tested against fixture repositories. No UI.
3. **Detection UI** — the checklist and `<SeededValue>`.
4. **Clone** — the copy-from selects.

Phase 1 depends on the workflow-collapse migration having landed, since it writes into the workspace layout.

## Testing

- `ensureWorkspaceSeeded` on an empty directory produces one registered workflow with four state folders, `workflow.yaml`, `permissions.yaml`, and a `PROCESS.md` containing all four state headings.
- It is a no-op on a workspace that already has a `workspace.yaml`, including one with `workflows: []` — a user who deleted the starter workflow does not get it back on next read.
- Each detector fires on a fixture repo containing its evidence and stays silent on one that does not.
- A fixture with both `package.json` and `Makefile` proposes from both without duplicates.
- Write/Edit proposals come back `preselected: false`. **This is the assertion most worth mutation-testing** — flipping the default to `true` must fail a test, or the review step is decorative.
- Detection against a nonexistent root returns `[]` rather than throwing.
- Detection against a root with an unreadable file skips it and still returns other detections.
- `detectProjectDefaults` writes nothing: the fixture directory's mtimes and contents are unchanged after a call.
- Cloning a workflow copies `runtime` and `permissions` and does **not** copy states or `PROCESS.md`.
- Templates: no import of `boardContextTemplate` survives; `STARTER_WORKFLOW` has an importer. A dead-export check would have caught the regression this spec exists to fix, and is worth adding for that reason.

## Open Risks

**A wrong default is worse than no default.** The whole design leans on this, and the review checklist is the mitigation. If the checklist becomes something users click through without reading, detection has made permissions less considered rather than more. Keeping the proposal count small and the reasons specific is what keeps it real.

**`.claude/settings.json` import re-creates a solved problem.** Importing a repo's settings copies grants written for a different tool invocation, and the workflow-collapse spec already found that such a file was silently additive to Meeseeks-generated permissions. Import must be a one-time copy into the project config, clearly shown, not an ongoing read of that file.

**Detection encodes ecosystem assumptions that age.** `npm run typecheck` is a convention, not a standard. Detectors should propose from what a file *declares* — the scripts actually present in `package.json` — rather than from names Meeseeks expects to find.

**First-run seeding writes to disk on a read path.** `ensureWorkspaceSeeded` runs inside what callers experience as a read. It must be idempotent and must not throw into `readWorkspace`'s callers: a workspace that fails to seed should still open, empty, rather than becoming unopenable.

## Reference

| Fact | Source |
| --- | --- |
| Orphaned starter templates | `src/storage/templates.ts`, no importers for 3 of 4 exports |
| Workspace auto-create, no seeding | `src/storage/workspace.ts:102` |
| Project root exempt from `resolveWithin` | `src/storage/project.ts:19` |
| Runtime provenance precedent | `WorkflowDetail.runtimeInherited`, `WorkflowEditorRoute.tsx:215` |
| Repo introspection previously deferred | [Onboarding Defaults](2026-06-09-onboarding-defaults-design.md), "Non-goals" |
| Workspace audit (8 sources, 2 useful) | `workflows/development/`, `boards/meeseeks-board/.claude/` |
