# Deep Agents Code (`dcode`)

Deep Agents Code, invoked as `dcode`, is LangChain's open-source terminal coding agent built on the [Deep Agents](deep-agents.md) SDK. At the previous ingest it was a single paragraph and a stub doc link; it now carries a sixteen-page documentation subtree (`docs.langchain.com/oss/python/deepagents/code/*`), which makes it the first LangChain-ecosystem artifact that Meeseeks could supervise *without changing what Meeseeks is*. That matters more than its feature list: `dcode` is a supervised-CLI surface sitting on a framework/server runtime, and it is therefore the sharpest available test of the [two-paradigm framing](../syntheses/harness-paradigms.md) — a harness in the shape of [Claude Code](claude-code.md) and [Pi](pi.md) that has already solved the durability problem Meeseeks defers.

It installs with `curl -LsSf https://langch.in/dcode | bash`, is distributed as the PyPI package `deepagents-code` (installed via `uv tool`), and works with any tool-calling LLM. Windows is explicitly unsupported except under WSL — a constraint that belongs alongside the macOS issues catalogued in [platform constraints](../concepts/platform-constraints.md), since a Meeseeks harness adapter would inherit it.

## Durable threads: the capability Meeseeks defers

The single most consequential fact for Meeseeks is that `dcode` persists sessions to disk automatically. Conversation checkpoints live in a SQLite database at `~/.deepagents/.state/sessions.db`, and the CLI exposes them as a first-class management surface:

- `dcode -r` resumes the most recent thread; `dcode -r <thread-id>` resumes a specific one. Resuming restores the thread's original agent, overriding agent-selection flags.
- `dcode threads list` filters by `--agent`, `--branch` (git branch), and `--cwd`, sorts by `created` or `updated`, and with `-v` shows the initial prompt of each session.
- `dcode threads delete <id>` removes one, with `--dry-run` support.

Compare this to the current [Runtime Supervisor](../components/runtime.md), where a session's history lives in a volatile 2 MB circular ring buffer inside a `runtimes` Map that dies with the server process, and where "runtime persistence across server restarts" is an explicitly deferred feature. `dcode` ships that persistence as a property of the runtime, because the underlying agent is a LangGraph graph with a [checkpointer](../concepts/langgraph-durable-execution.md). The `--branch` and `--cwd` filters on `threads list` are particularly suggestive: they are, in effect, the query Meeseeks would need to answer "what agent sessions exist for this ticket's working directory?" — already implemented, and already `--json`-addressable.

This is the strongest available evidence for the [attention-economics synthesis](../syntheses/attention-economics.md)'s central claim that durability is *separable* from the paradigm migration. `dcode` is unambiguously a process to be supervised over stdio, and it is durable anyway. The framework/server runtime is what supplies the durability, but Meeseeks would consume it as a CLI, not as an HTTP client.

## The hook bus, and where it falls short

`dcode` emits lifecycle events to external commands configured in `~/.deepagents/hooks.json`. Each entry declares a `command` (an argv list, executed with `shell=False` — no shell expansion) and an optional `events` filter; omitting the filter subscribes to everything. When an event fires, `dcode` pipes a JSON payload to the command's stdin. The documented events are:

| Event | Payload | Meaning |
|-------|---------|---------|
| `session.start` | `thread_id` | Session begins (interactive and non-interactive) |
| `session.end` | `thread_id` | Session exits |
| `user.prompt` | — | User submitted a chat message (interactive only) |
| `input.required` | — | Agent needs human input (HITL interrupt) |
| `permission.request` | `tool_names` | Fired before the approval dialog |
| `tool.error` | `tool_names` | A tool call returned an error |
| `task.complete` | `thread_id` | Streaming loop ended with no further interrupts |
| `context.compact` | — | Fired before context summarization |

Hooks run fire-and-forget on a background thread with a 5-second per-command timeout, dispatched concurrently, with the config lazily read once on first event and cached for the session.

This is a materially better state-detection substrate than what [Claude Code state detection](../concepts/claude-code-state-detection.md) describes Meeseeks doing today. `input.required` and `permission.request` are *explicit, first-party* signals for the `awaiting-user` state that the supervisor currently infers by sniffing carriage returns (`0x0d`) out of the PTY byte stream and applying a 2-second startup debounce. `task.complete` is a cleaner `idle` signal than the injected `Stop` hook, and `tool.error` has no Claude Code analog at all.

Two gaps qualify that, and both are load-bearing for a multi-session orchestrator:

**The hook config is global, not per-session.** `hooks.json` is read from `~/.deepagents/` only; there is no documented per-invocation equivalent of the `--settings` flag that Meeseeks uses to write an ephemeral, per-session `session-<id>.json` and delete it afterward. The supervisor's whole hook-injection seam — described in the [sandboxing runbook](../runbooks/claude-code-sandboxing.md) as ephemeral-by-construction — has no direct counterpart here. A `dcode` adapter would have to install one global hook handler and demultiplex.

**Demultiplexing is not fully possible from the payloads.** Only `session.start`, `session.end`, and `task.complete` carry `thread_id`. The events Meeseeks most needs for the attention doorbell — `input.required`, `permission.request`, `user.prompt`, `context.compact` — carry no thread or session identifier, so with several `dcode` processes running concurrently under one global hook config, a handler cannot tell *which* session is asking for input. Meeseeks' current design routes each Claude Code session's hooks to a distinct `/internal/runtime/{id}/notify` URL baked into the per-session settings file; that trick is unavailable. Until the payloads carry correlation IDs, a supervisor would have to fall back on process-level correlation (matching hook invocations to child PIDs) or on parsing stdout. This is a single-source observation from the hooks documentation and worth re-checking against the implementation before it is relied upon.

## Invocation surface

`dcode` runs interactively by default and non-interactively under several triggers, which maps cleanly onto the ticket-session and [one-shot prompt](../concepts/one-shot-prompts.md) split Meeseeks already draws.

**Interactive.** A full TUI with roughly forty slash commands (`/model`, `/agents`, `/threads`, `/goal`, `/rubric`, `/remember`, `/offload`, `/tokens`, `/trace`, `/reload`, `/theme`, …), `!` shell mode, `@filename` completion that injects file content, and readline-style editing. `-m/--message` auto-submits an initial prompt at launch, and `--startup-cmd` runs a shell command first — but its output is rendered in the transcript *only* and is deliberately **not** added to the agent's message history, so it cannot be used to feed context. Piping via stdin is the documented way to hand command output to the agent.

**Non-interactive.** `-n/--non-interactive "task"` runs a single task and exits; piped stdin triggers the same mode automatically (10 MiB cap), with piped content ordered before any `-n`/`-m` text. `-q/--quiet` restricts stdout to the agent's response for clean piping, and `--no-stream` buffers the whole response instead of streaming it. Crucially for an orchestrator, each non-interactive run **starts a fresh thread** — only file-based state (memory, skills, config) carries across invocations.

**Budgets.** `--max-turns N` and `--timeout SECONDS` cap a non-interactive run, and both exit with code **124** (matching GNU `timeout`) so a caller can distinguish a budget hit from a generic failure. Both require `-n` or piped stdin, exiting 2 otherwise. `--recursion-limit` (25–100000, default 2000) caps LangGraph node invocations per turn. Meeseeks' one-shot prompt lane currently has no equivalent guard against a runaway agent; these flags are the cheapest possible version of one.

**Machine-readable output.** Management subcommands accept `--json` and emit a stable envelope, `{"schema_version": 1, "command": "...", "data": ...}`. Combined with `dcode config show --json` (which reports every option's effective value *and the source it resolved from*, with secrets reported only as configured/not-configured) and `dcode doctor`, this is a substantially more introspectable control surface than Claude Code offers — an adapter can interrogate the harness rather than guess at it.

## Permissions: three approval modes and two independent gates

Gated actions — `write_file`, `edit_file`, `delete`, `execute`, `web_search`, `fetch_url`, and `task` — require approval by default; read-only tools (`ls`, `read_file`, `glob`, `grep`) never prompt. Three modes govern the gate:

- **Manual** (default) prompts before every gated action.
- **Auto** (`-y`) runs narrowly-scoped routine actions deterministically and refers everything else to the active model, which checks the action against the user's literal prompt; repeated denials or classifier failures escalate to a human prompt. It is an experimental beta requiring `DEEPAGENTS_CODE_EXPERIMENTAL=1`.
- **YOLO** (`--yolo`) runs gated actions with no review, behind a one-time stored risk acknowledgement.

Precedence runs `--yolo` > `-y` > `[startup].mode` in `config.toml`; `Shift+Tab`/`Ctrl+T` toggles Manual↔Auto mid-session but can never enter YOLO. The docs are explicit that Auto "is **not** sandbox containment, an operating-system boundary, or a guarantee that model-generated actions are safe" — an authorization heuristic, not a security boundary, which is the same distinction the [guardrails](../concepts/langchain-guardrails.md) page draws between in-band policy and access control.

**Auto and YOLO are interactive-mode only.** Neither is available under `-n`, piped stdin, or ACP server mode, and Auto additionally falls back to Manual whenever a remote `--sandbox` is active. Headless runs are instead governed by two orthogonal flags that a supervisor must set together:

- `--allow-fs-tools` selects *which filesystem tools exist* (default all; an explicit list must include `read_file`). Shell access requires `execute` to be in the list.
- `-S/--shell-allow-list` selects *which shell commands are permitted through `execute`* — a comma-separated list, `recommended` for curated safe defaults, or `all` for anything. Shell execution is disabled by default in non-interactive mode.

So an unattended Meeseeks-style run needs `dcode -n "…" --allow-fs-tools execute -S "pytest,git,make"`. This two-gate model is finer-grained than Claude Code's permission modes and is enforced *inside* the harness rather than by an OS sandbox — the containment contrast already drawn on the [Deep Agents](deep-agents.md) page, now with concrete flags.

## Instructions, memory, and skills on disk

`dcode` splits state across `~/.deepagents/` (agent-specific) and `~/.agents/` (tool-agnostic, shared across AI CLIs), plus project-level dotfiles. Instructions layer as an immutable packaged base prompt → user customizations at `~/.deepagents/{agent}/AGENTS.md` → project instructions at `.deepagents/AGENTS.md` or root `AGENTS.md`, following the [agents.md](https://agents.md/) convention. Both the global and project files are **appended to the system prompt at startup**, and the project root is identified by a containing `.git` directory. Alongside them the agent maintains auto-written memories as topic-named Markdown files under `~/.deepagents/{agent}/memories/`, following a memory-first protocol (search memory before starting, check when uncertain, save what it learns); `/remember` triggers an explicit consolidation pass over the conversation. Additional structured knowledge files are only discovered if `AGENTS.md` references them — they are not read at startup.

Skills follow the [Agent Skills specification](https://agentskills.io/), with only `name` and `description` frontmatter read at startup and the body loaded on match. Discovery spans six roots with **higher precedence winning completely, no merging**: user agent skills, user tool-agnostic, project, project tool-agnostic, and — flagged experimental — `~/.claude/skills/` and `.claude/skills/`. Symlinks resolving outside those roots are rejected unless whitelisted via `[skills].extra_allowed_dirs`.

**This resolves an obstacle recorded here earlier.** The previous version of this page stated that `dcode` offers no `--append-system-prompt` equivalent for injecting board context. That was wrong in emphasis: the seam exists, it is just *file-based rather than flag-based*. A project `AGENTS.md` under the working directory is appended to the system prompt at startup, which is functionally what Meeseeks' `--append-system-prompt` preamble achieves — board `CONTEXT.md` and lane `PROCESS.md` would be written to `<boardPath>/.deepagents/AGENTS.md` rather than passed as an argv string. Two real constraints survive the correction, and they are narrower than a missing seam:

- **The file is writable by the agent, not read-only.** The docs are explicit that the agent "updates `AGENTS.md` as you provide information on how it should behave" and when it infers preferences from interaction. So a board-context file placed there is not inert configuration — the agent may rewrite it mid-session. That collides directly with the [focus-gated editor](../concepts/focus-gated-editor.md)'s assumptions and would surface through the chokidar watcher as an external edit to a board document. Meeseeks currently owns `CONTEXT.md` unilaterally; under `dcode` it would share ownership with the agent.
- **Project scope is git-rooted.** Because project instructions, project skills, and project MCP configs are all located relative to the nearest `.git` ancestor, a board directory that is not a git root does not get its own project scope. Meeseeks does not require boards to be repositories.

The net effect is that this is no longer a blocking gap in the [instruction-bootstrapping](../concepts/claude-code-instruction-bootstrapping.md) comparison — it is a shared-ownership problem and a directory-layout constraint.

Named agents (`-a/--agent NAME`) give each agent its own memory, skills, and `AGENTS.md` under `~/.deepagents/<name>/`, with `dcode agents reset --agent NAME [--target SOURCE]` to clear or copy memory between them. That is a plausible mapping target for Meeseeks' per-lane `PROCESS.md`: a lane becomes a named agent rather than a preamble fragment.

## Goals and rubrics

`dcode` ships a self-grading loop. *(Correction, 2026-07-25: this page previously said it had "no Claude Code analog." Claude Code has `/goal [condition|clear]`, which keeps working across turns until a condition is met — see the [capability surface](claude-code.md#capability-surface). The two converge on the same idea; `dcode` differs by making the criteria explicit, reviewable, and separately graded rather than treating the goal as a single condition.)* A **goal** (`/goal <objective>`) has the agent draft acceptance criteria for inline review — accept, edit, revise, or cancel — after which the goal persists across turns and every follow-up turn is graded against its criteria until the work is approved, with `/goal amend`, `/goal pause`, and `/goal resume` for steering without replaying work. A **rubric** is used when the criteria are already known: `/rubric set` for sticky criteria, `/rubric next` for a one-turn quality gate, `/rubric file <path>` to read them from disk. The grading model and iteration ceiling are independently configurable (`/goal model`, `/goal max-iterations`).

Non-interactive runs cannot pause for goal review, so scripted use goes through `--rubric TEXT|@PATH` with `--rubric-model` and `--rubric-max-iterations`. The `@PATH` form is the interesting one for Meeseeks: tickets are already Markdown files that frequently contain acceptance criteria, so `dcode -n "$body" --rubric @<ticket>.md` would wire the [project model](../concepts/project-model.md)'s existing ticket content directly into a grading loop. That is the closest thing yet found to the eval-loop-on-board-documents idea the [attention-economics synthesis](../syntheses/attention-economics.md) proposes, available without any paradigm migration.

## Extension surfaces

**Remote sandboxes.** `--sandbox` routes tool execution to `langsmith` (bundled), `agentcore`, `daytona`, `modal`, `runloop`, `vercel`, or third-party providers such as E2B, with `--sandbox-id` to reuse an instance, `--sandbox-snapshot-name` for snapshots, and `--sandbox-setup` to run a provisioning script. This uses the *sandbox-as-tool* pattern: the `dcode` process — LLM loop, memory, tool dispatch — stays on the local machine while tool calls target the remote environment. Because `--sandbox` takes an optional value, the bare form must come last on the command line or it swallows the next argument; an adapter assembling argv programmatically needs to know that.

**MCP.** Servers are auto-discovered from `.mcp.json` at three precedence levels — `~/.deepagents/.mcp.json` (user), `<project>/.deepagents/.mcp.json`, and `<project>/.mcp.json` (highest, and explicitly documented as *Claude Code compatible*) — with the project root resolved as the nearest `.git` ancestor, falling back to cwd. Configs merge by server name, but a higher-precedence definition **replaces the entire server object**; nested fields are not deep-merged. `--mcp-config PATH` adds a highest-precedence source, `--no-mcp` disables loading entirely, and `--trust-project-mcp` approves project-level servers for one run. Project servers lacking a saved approval are *silently skipped* in non-interactive mode — a quiet-failure mode an orchestrator should expect. Notably, `dcode` refuses to read the project-MCP trust variables from a project `.env`, so a repository cannot approve its own servers. This is the same [MCP](../concepts/langchain-mcp.md) substrate Claude Code and Pi consume — and here quite literally so, since an existing Claude Code `.mcp.json` is picked up with no extra setup.

**Plugins.** `/plugins` and `dcode plugin …` install bundles of skills and MCP servers from marketplaces (GitHub `owner/repo`, Git URL, JSON URL, or local path). `dcode` reads **Claude-style `.claude-plugin/plugin.json` and Codex-style `.codex-plugin/plugin.json` manifests**, and honours `${CLAUDE_PLUGIN_ROOT}` path variables. Together with the shared `~/.agents/skills/` root, the experimental `~/.claude/skills/` and `.claude/skills/` discovery paths, and auto-detection of a Claude Code `.mcp.json` at the project root, this amounts to deliberate and fairly thorough cross-CLI compatibility. The skills half of that is best understood not as one vendor reading another's layout but as **both implementing the same open standard**: Deep Agents skills and [Claude Code skills](claude-code.md#capability-surface) each follow the [Agent Skills specification](https://agentskills.io), with each vendor adding extensions on top. The plugin manifests and `.mcp.json` discovery are the genuinely one-directional compatibility gestures. For Meeseeks the practical consequence is that a board already configured for Claude Code carries much of its configuration over to `dcode` unchanged.

**Configuration.** General options resolve `DEEPAGENTS_CODE_`-prefixed env var → canonical env var → `~/.deepagents/config.toml` → built-in default. The prefix doubles as a scoping mechanism for third-party credentials: `DEEPAGENTS_CODE_OPENAI_API_KEY` gives `dcode` its own key without affecting other tools, and setting it empty makes `dcode` ignore a shell-exported one. That directly addresses the env-leakage problem recorded in [platform constraints](../concepts/platform-constraints.md), and it is a cleaner answer than anything Claude Code offers. Model resolution runs `--model` → `[models].default` → `[models].recent` → auto-detection from the first available provider credential, which parallels the config-driven model picker Meeseeks added to `project.yaml`. `config.toml` also carries `[startup].mode`, `[runtime].recursion_limit`, and a `[retries]` section with per-provider overrides and a six-level precedence chain down to the provider SDK default.

## Credentials, providers, and gateways

This surface matters to Meeseeks more than its placement in the docs suggests, because it addresses the exact constraint that drove the config-driven model picker: a corporate gateway setup with no reusable `ANTHROPIC_API_KEY`, which made the live Models API unreachable and forced model choice into `project.yaml`.

**Key resolution is three-tiered**, first match wins: a `DEEPAGENTS_CODE_`-prefixed environment variable, then an app-stored key entered through the `/auth` manager (persisted to an `auth.json` credential store), then the plain provider variable such as `OPENAI_API_KEY`. The ordering is deliberate — an app-stored key beats a plain env var, so a machine that already exports a shared provider key for other tooling does not leak it into `dcode`, while the prefixed form still overrides everything for a single run.

**Keys and endpoints resolve as a pair.** `base_url` resolves `config.toml` → prefixed endpoint var → plain endpoint var → the endpoint saved alongside an `/auth` credential → the SDK default, and the two are deliberately kept together: replacing a gateway-provisioned key with your own also drops the gateway endpoint, so the key is not sent somewhere that would reject it. On a gateway-provisioned machine, the gateway exports the key and matching `*_BASE_URL` together and `dcode` uses the pair with no configuration at all. This is a materially better answer to the gateway problem than Meeseeks currently has.

**`dcode auth` is the scriptable half** of the `/auth` TUI — `list`, `status`, `set`, `remove`, `path`. `set` reads the key from **stdin by default** so it never enters shell history or `argv`, accepts `--from-env VAR`, and *refuses to run in an interactive terminal* so a stray invocation cannot hang. For an orchestrator provisioning credentials this is the right shape, and it has no Claude Code equivalent.

**Provider coverage is broad and extensible.** Roughly two dozen providers are built in (OpenAI, Anthropic, Gemini bundled; the rest as install extras), including `openai_codex`, which authenticates through a ChatGPT browser sign-in rather than an API key. Beyond those, `[models.providers.<name>]` accepts a `class_path` pointing at any `BaseChatModel` subclass — with the explicit caveat that this executes arbitrary Python from the config file — plus `base_url` retargeting for OpenAI/Anthropic-wire-compatible endpoints, `enabled = false` to hide auto-discovered providers, and `profile` overrides. Lowering `max_input_tokens` via a profile override is worth noting: it is what triggers auto-summarization earlier, and without a profile the fallback is a fixed ~170,000-token threshold that may never fire before a smaller model's hard limit. Notably, this page settles the provider question flagged on [LangChain Models](../components/langchain-models.md) — NVIDIA is a first-class entry in the provider table with `langchain-nvidia-ai-endpoints`.

**Tracing.** `dcode` traces to [LangSmith](langsmith.md) natively once a key is added via `/auth`, with `DEEPAGENTS_CODE_LANGSMITH_PROJECT` to separate agent traces from traces produced by code the agent runs, `DEEPAGENTS_CODE_LANGSMITH_REDACT` for client-side secret redaction (tracing disables itself if redaction cannot be configured), and `DEEPAGENTS_CODE_LANGSMITH_REPLICA_PROJECTS` to dual-write. Where the [tracing runbook](../runbooks/tracing-meeseeks-sessions-to-langsmith.md) has to route Claude Code through a plugin and the settings-file seam, `dcode` needs only an environment variable — the [observability](../concepts/langsmith-observability.md) half of the attention argument comes free.

## What this means for Meeseeks

`dcode` is the first candidate harness that is simultaneously supervisable as a process and durable as a runtime. Adopting it would leave the supervisor's `SpawnSpec` shape intact — it is argv, env, and cwd like the others — while retiring the ring buffer's role as the only record of a session, replacing carriage-return state sniffing with typed lifecycle events, and adding budgets, rubric grading, and native tracing that Meeseeks would otherwise build.

It would also inherit a credential model that handles the gateway case Meeseeks currently works around, and — through Claude-compatible `.mcp.json`, skill, and plugin discovery — much of a board's existing Claude Code configuration unchanged.

The costs are real and specific. The **global-only hook config with un-correlated event payloads** remains the sharpest open question on this page: it is a genuine obstacle to concurrent multi-session supervision, and unlike the others it has no documented workaround. Beyond it: board context injected through a project `AGENTS.md` is *shared ownership*, since the agent writes to that file too; project scope is git-rooted, which boards are not required to be; Auto approval is unavailable in exactly the unattended lane where an orchestrator would want it; and the agent is Python-distributed, so Meeseeks would supervise a `uv`-installed tool rather than a self-contained binary. None of these is disqualifying, and all of them are narrower than the framework/server migration the [harness paradigms](../syntheses/harness-paradigms.md) capstone contemplates.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/overview |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/quickstart |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/cli-reference |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/configuration |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/hooks |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/approval-modes |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/goals-and-rubrics |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/subagents |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/remote-sandboxes |
| 2026-07-24 | https://docs.langchain.com/oss/python/deepagents/code/plugins |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/code/memory-and-skills |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/code/credentials |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/code/config-file |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/code/providers |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/code/mcp-tools |
| 2026-07-24 | `src/runtime/supervisor.ts`, `src/runtime/claude-code.ts` — the comparison baseline |
