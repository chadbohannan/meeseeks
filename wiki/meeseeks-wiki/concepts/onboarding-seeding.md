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

First contact with a workspace is `openWorkspace` (`src/storage/open.ts`): it writes a
default `workspace.yaml` when the directory has none, calls `ensureWorkspaceSeeded`
(`src/storage/seed.ts`), and then reads the workspace back. The server calls it once at
startup, and `bootTestServer` calls it for the same reason; nothing else does.

This used to live on the read path. `readWorkspace` created the file when it found
none, and its auto-create branch was the seeding seam — which meant a function running
on nearly every request had to decide, every time, whether this was the creating call.
The only signal it had was "the config file is missing", which is also what a mistyped
root or an unmounted volume looks like. Splitting creation out made `readWorkspace`
pure: a missing workspace is now a `NotFoundError`, and the two situations stopped
being the same event. It also dissolved the `workspace -> seed -> workflow ->
workspace` module cycle that had to be broken with a dynamic import — nothing under
`workspace.ts` imports `open.ts`, so the loop no longer exists.

Two constraints on the call site survive that move, and each was a decision rather than
an accident:

**Failure is swallowed, not thrown.** A workspace that fails to seed must still open —
empty is a working state, unopenable is not — so `openWorkspace` logs and falls through
to reading the unseeded config.

**Seeding goes through `createWorkflow`.** The same function the UI calls, so there is a
single code path producing workflow structure on disk. The seeded workflow is an
ordinary workflow: nothing in storage records that it was seeded, because that
distinction would have to be maintained forever to serve one first-session affordance.

Idempotence comes from the registry rather than a flag: `ensureWorkspaceSeeded` returns
early when `workflows:` is non-empty. A user who deletes the starter workflow does not
get it back, and `openWorkspace` on a workspace that already has a `workspace.yaml`
skips creation and seeding entirely, so it is safe to call on an open workspace.

## Detection: proposals, never writes

`detectProjectDefaults` (`src/storage/detect.ts`) reads a project root and returns a
list of `Detection` proposals. It writes nothing — not to the project config, and not
to the repository it inspects — and its tests assert the second half of that by
snapshotting the fixture's sizes and mtimes across a call.

`reason` and `evidence` are required fields on the type rather than optional
decoration. They are what makes a proposal reviewable: a grant whose basis the user
cannot see is one they cannot meaningfully accept, and a checklist people click
through without reading has made permissions *less* considered rather than more.
This is the same provenance discipline the codebase already applies to
`WorkflowDetail.runtimeInherited` and to `ResolvedPermissionEntry.origins` — a seeded
value is simply a third kind of value the user did not type.

**Edit proposals come back unselected.** Read access to a repository and write access
to it are different decisions, and only the first is implied by registering it.
The test asserting `preselected: false` on those proposals is the one most worth
mutation-testing: if flipping that default to `true` does not fail a test, the review
step is decorative.

**Write-access proposals are spelled `Edit(path)`, never `Write(path)`.** Claude Code
matches every file-editing tool — `Write` included — against `Edit(path)` rules only;
a `Write(path)` rule matches nothing, and the agent prints a startup warning for each
one telling the user to use `Edit` instead. Detection originally proposed both spellings
for every source directory, which meant every accepted grant produced one working rule
and one warning, visible in the console window Meeseeks renders. `detectSourceDirs`
now emits a single `Edit(...)` proposal per directory, and a test asserts no proposal
ever starts with `Write(`. Project configs written before that change still carry the
inert twins; deleting the `Write(...)` line beside each `Edit(...)` line in
`~/.local/share/meeseeks/projects/*.yaml` silences the warnings without changing what
the agent may do.

Detectors propose from what a file **declares**, not from names Meeseeks expects to
find. `npm run typecheck` is a convention, not a standard, so the npm detector walks
the scripts actually present in `package.json` and proposes for those whose names read
as verification — which is why a repo declaring `test:e2e` gets a proposal and a repo
declaring only `dev` gets none. The same rule governs the Makefile detector, which
reads targets off the left of `name:` lines and therefore misses generated and included
ones: a missing proposal the user can add by hand beats a proposal for a target that
does not exist.

Detection is deterministic file inspection, never an LLM pass. A model would write
better prose non-reproducibly, at a cost, over the network, at the moment a new user is
deciding whether the tool works — and it could not produce the one-line justification
that makes a proposal reviewable.

`POST /api/projects/detect` is a separate endpoint rather than a step inside project
creation, for two reasons: it runs *before* the project exists, while the user is still
typing a path, and it must be re-runnable against an existing project without mutating
it. It is a POST because the root travels in the body, not because it changes anything.
The route is registered ahead of `/api/projects/:projectId` so `detect` is not captured
as a project id.

Importing a repository's own `.claude/settings.json` is a **one-time copy** shown like
any other proposal, never an ongoing read. The workflow collapse found exactly such a
file silently adding to Meeseeks-generated permissions; the point of moving those
grants into the project config is that each grant then has one source.

## The checklist, and what accepting one does

`DetectionChecklist` runs detection on demand and renders each proposal through
`SeededValue`, which shows the value, its reason, and its evidence on the row rather
than behind a tooltip — a justification people have to hover to see is one they will
not read, and a checklist nobody reads has made permissions less considered rather
than more. Accepting hands the values back to the form, which folds them into its
draft; the user still has to save. Nothing detection touches is written before that.

Accepted permissions are **unioned** into `allowedTools`, never substituted for it, so
a grant the user wrote by hand survives an accept. The folding rules live in
`src/web/lib/detections.ts` as pure functions, imported relatively rather than through
the `@shared/*` alias so the server tsconfig can pull them into `tests/` — the same
arrangement `model-options.ts` uses, and the repository's answer to having no DOM test
harness.

Nothing lands in `allowedPaths`: every proposal the detector makes is a tool pattern,
and `allowedPaths` is the `--add-dir` list that the project root already covers.

### Why a context file may point outside the workspace

A `context` proposal names the repository's own `CLAUDE.md` or `AGENTS.md`, and
accepting it sets the project's `contextFile`. That path is exempt from
`resolveWithin` when absolute, the same exemption `ProjectConfig.root` carries and for
the same reason: the document worth pointing at lives in the codebase, which is
outside the workspace by definition.

It is worth being explicit about why this is not redundant with the harness's own
behaviour. Claude Code reads `CLAUDE.md` from its working directory — and since the
workflow collapse that directory is the *workspace root*, not the project root. The
repository's own instructions are therefore **not** picked up natively; the project
root reaches the agent only as an `--add-dir`. Naming the file in `contextFile` is
what gets its contents into the preamble.

Inline `context` takes precedence over `contextFile`, which forces two rules that were
not previously exercised because only a hand-edited YAML could set the file field:
`updateProject` treats an empty string as *clear* rather than *set to empty* for both
fields, and `ProjectDetail` reports `contextFile` alongside `contextContent`. Without
the second, the project editor would load a file's contents into its inline-context
textarea and save them back as inline text — silently converting a live reference into
a stale snapshot.

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

Write access is absent for a different reason. Granting read access to a repository
and granting write access to it are different decisions, and only the first is implied
by the act of registering it. The same asymmetry governs detection, where `Edit`
proposals arrive unselected.

`createProject` applies the starter set only when the caller supplies no `permissions`
at all; a caller that supplies its own — including an empty block — overrides it
entirely. This is seeding, not detection, so it may write without a review step: the
value is a fixed template rather than an inference about the user's machine. A blank
default would be no safer, only less useful.

## Cloning: configuration, not content

The third tier copies from what already exists in the workspace. `copyFrom` on the two
create endpoints names a source workflow or project, and the server reads it — the SPA
never round-trips a permission set it has no other reason to hold, and the resolution
happens where the source files are.

What is copied is deliberately narrow. A workflow contributes its **own** `runtime:`
block and its permissions; a project contributes its permissions and badge colour.
Everything else is either content or identity:

- **States and `PROCESS.md` are not copied.** They are content. Copying them produces a
  duplicate of the source workflow including the parts nobody got around to writing,
  and a user creating a second workflow wanted a different process, not the same one
  twice. Tier 1 already gives them a good starting process.
- **An inherited runtime is not copied.** `resolveWorkflowRuntime` would hand back the
  workspace default; writing that into the new workflow converts an inheritance into a
  declaration that no longer tracks the default. `readClonableWorkflowConfig` reads the
  workflow's own block for exactly this reason.
- **An all-empty permissions block is not copied.** Three empty arrays is what every
  workflow starts with; carrying it over would make the clone look configured when it
  is not.
- **A project's `root` and `context` are not copied.** Two projects pointing at one
  codebase is the single thing a copy must never produce, and a context document
  describing one codebase is wrong for any other.

Permissions from the two tiers are **unioned, not chosen between**. Running the form
proved why: with a source project selected *and* detections accepted, an
explicit-wins rule silently dropped the copied set — including its `deniedTools`,
which is the half that exists to hold a floor. Scalar fields like the badge colour
have no union to fall back on, so there the request still wins.

Where two proposals compete for one field, the first accepted wins rather than the
last. A repository can carry both a `CLAUDE.md` and an `AGENTS.md`, and `contextFile`
holds one path; detection proposes `CLAUDE.md` first, so the outcome matches the order
the user was reading. The confirmation line names the file it will write for the same
reason.

## References

| Fact | Source |
| --- | --- |
| Seeding seam and swallowed failure | `src/storage/open.ts`, `openWorkspace` |
| Idempotence via the registry | `src/storage/seed.ts` |
| Starter templates and `{root}` placeholder | `src/storage/templates.ts` |
| Starter set applied on project create | `src/storage/project.ts`, `createProject` |
| Detectors, dedupe, and tolerance rules | `src/storage/detect.ts` |
| Detection endpoint | `src/server/routes/projects.ts`, `POST /api/projects/detect` |
| Checklist and proposal row | `src/web/components/DetectionChecklist.tsx`, `SeededValue.tsx` |
| Accept-folding rules | `src/web/lib/detections.ts` |
| Absolute `contextFile` exemption | `src/storage/project.ts`, `resolveContext` |
| Clonable configuration | `readClonableWorkflowConfig`, `readClonableProjectConfig` |
| Workspace audit (8 sources, 2 useful) | [Onboarding Seeding design](../../../docs/superpowers/specs/2026-08-14-onboarding-seeding-design.md) |
