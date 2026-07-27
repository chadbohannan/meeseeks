# Deep Agents Filesystem Backends

Every [Deep Agent](../systems/deep-agents.md) exposes a filesystem surface to the model — `ls`, `read_file`, `write_file`, `edit_file`, `delete`, `glob`, `grep` — but those tools are a *facade* over a pluggable backend. The backend decides where bytes actually live: agent state, real disk, a cross-thread store, a LangSmith Context Hub repo, a remote sandbox, or several of those at once behind a router. This indirection is one of the more consequential design decisions in the framework, because it lets the same agent code run against a scratchpad in development and an isolated sandbox in production without touching the agent definition.

Across all backends, `read_file` natively handles images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`), returning them as multimodal content blocks. Sandbox backends and `LocalShellBackend` additionally provide an `execute` tool.

## The built-in backends

**`StateBackend` (default).** Files live in LangGraph agent state, scoped to the thread. They persist across turns via the [checkpointer](langgraph-durable-execution.md) and are *not* shared across threads. It is designed for use from inside a graph — calling backend methods outside a graph run has no effect until the graph executes. Best as a scratchpad and for automatic eviction of large tool outputs the agent can read back piecemeal. Importantly, this backend is **shared between the supervisor and its subagents**: files a subagent writes remain in state after that subagent finishes, and stay visible to the supervisor and other subagents — which makes it the framework's implicit channel for passing work products between delegated tasks.

**`FilesystemBackend` (local disk).** Reads and writes real files under a configurable absolute `root_dir`, with secure path resolution, symlink-traversal protection where possible, and optional ripgrep-backed `grep`. The docs carry a strong warning: it is appropriate for local development CLIs and CI, and *inappropriate* for web servers or HTTP APIs. The security note that matters most is easy to miss — **`virtual_mode=True` must be set alongside `root_dir` to get path-based access restrictions** (blocking `..`, `~`, and absolute paths outside root); the default `virtual_mode=False` "provides no security even with `root_dir` set."

**`LocalShellBackend`.** Extends `FilesystemBackend` with an `execute` tool running commands via `subprocess.run(shell=True)` with no sandboxing, supporting `timeout` (default 120s), `max_output_bytes` (default 100,000), `env`, and `inherit_env`. Commands use `root_dir` as working directory but **can access any path on the system**, so `virtual_mode` provides no protection once shell access is enabled. The docs recommend human-in-the-loop review strongly here.

**`StoreBackend`.** Files live in a LangGraph `BaseStore` supplied by the runtime, giving durable **cross-thread** storage — the natural home for long-term memory and instructions spanning many executions. On LangSmith Deployment a store is provisioned automatically and the `store` parameter should be omitted.

**`ContextHubBackend`.** Stores files durably in a LangSmith Hub repo without provisioning a separate LangGraph store.

**Sandbox backends.** LangSmith, AgentCore, Daytona, Deno, E2B, Modal, Runloop, or a local VFS — filesystem tools plus `execute`, in an isolated environment.

**`CompositeBackend`.** A router mapping path prefixes to different backends, with a `default` for everything else.

## Namespace factories: the multi-tenancy seam

`StoreBackend` takes a `namespace` factory — `Callable[[Runtime], tuple[str, ...]]` — that decides where data is read and written, and it is the mechanism for isolating tenants. The `Runtime` supplies `rt.context` (user-supplied context such as `user_id`), `rt.server_info` (assistant ID, graph ID, authenticated user), and `rt.execution_info` (thread, run, checkpoint IDs), so the common scopes are per-user (`rt.server_info.user.identity`), per-assistant, or per-thread, and these compose into tuples like `(user_id, thread_id)`.

Two details are worth flagging. Namespace components are validated — alphanumerics, hyphens, underscores, dots, `@`, `+`, colons, tildes — and **wildcards are rejected to prevent glob injection**. And the legacy default, used when no factory is given, namespaces by `assistant_id`, "which means all users of the same assistant share the same storage." That is a quietly dangerous default for a multi-user deployment, which is why the docs say the parameter becomes **required in v0.5.0**.

## The composite pattern, and why it is the recommended default

The docs recommend wrapping `FilesystemBackend` in a `CompositeBackend` for most use cases, for a reason that is not obvious: **Deep Agents write internal data to the backend automatically** — offloaded large tool results under `/large_tool_results/` and conversation history under `/conversation_history/`. Using `FilesystemBackend` alone dumps those agent artifacts onto real disk under `root_dir`, mixed in with project files. Routing `/workspace/` to `FilesystemBackend` while leaving the default as `StateBackend` keeps project reads and writes on disk and internal machinery in ephemeral state:

```python
backend=CompositeBackend(
    default=StateBackend(),
    routes={"/workspace/": FilesystemBackend(root_dir="/path/to/project", virtual_mode=True)},
)
```

The default composite arrangement — thread-scoped by default with `/memories/` persisted across threads — is also how filesystem-backed [agent memory](agent-memory.md) is assembled: memory is not a separate subsystem but a *route* in the filesystem namespace pointing at durable storage. That is the same trick [Managed Deep Agents](../systems/managed-deep-agents.md) uses when it remounts a Context Hub slice at `/memories/user/`.

## Permissions: declarative policy over the tool surface

Layered on top of any backend, `FilesystemPermission` rules (requiring `deepagents>=0.5.2`) give path-based access control over the built-in filesystem tools. Each rule has `operations` (`"read"` covering `ls`/`read_file`/`glob`/`grep`, `"write"` covering `write_file`/`edit_file`/`delete`), `paths` (globs supporting `**` recursion and `{a,b}` alternation), and `mode` — `"allow"`, `"deny"`, or `"interrupt"`. Rules evaluate in declaration order, **first match wins**, and if no rule matches the operation is **allowed**: the default is permissive, so a deny-everything catch-all rule must be written explicitly at the end of the list.

`mode="interrupt"` (requiring `deepagents>=0.6.8`) is the interesting one — instead of allowing or refusing, a matching write raises a [human-in-the-loop](human-in-the-loop.md) interrupt that a reviewer can approve, edit, or reject. These merge automatically with any `interrupt_on` tool-call gates and resume through the same flow, and they require a checkpointer since pausing means persisting state.

Two behaviours deserve emphasis because they are easy to get wrong:

- **Directory deletion is all-or-nothing.** `delete` checks `write` permission on the target *and every descendant*, refusing the whole operation if any is denied, rather than partially removing a tree.
- **Anchor interrupt patterns with a literal leading segment.** Bulk tools (`ls`, `glob`, `grep`, and directory `delete`) fire the interrupt whenever their search subtree *could* overlap the rule's anchored prefix, so an unanchored pattern like `/**/secrets` conservatively over-fires.

The scope limits are as important as the mechanism. Permissions apply **only to the built-in filesystem tools** — custom tools and MCP tools that touch the filesystem are not covered, and they do not apply to sandbox backends at all, since those permit arbitrary execution through `execute`. For custom validation (rate limiting, audit logging, content inspection) or to govern custom tools, the docs point to backend *policy hooks* instead. Read alongside the [interpreter](deepagents-interpreters.md)'s warning that PTC bypasses `interrupt_on`, a consistent picture emerges: Deep Agents' in-harness policy is enforced at the built-in-tool boundary, and every mechanism that routes *around* that boundary — sandboxes, custom tools, PTC — escapes it by design.

## Why this matters beyond Deep Agents

The backend abstraction is the concrete answer to a question the [harness comparison](../syntheses/harness-sdk-build-vs-supervise.md) raises: what does it mean for an agent framework to *decouple* execution from the agent definition? Here it is mechanical. The agent's prompt and tool schema are identical whether files land in RAM, on disk, in Postgres, or in a Modal sandbox; only the backend object changes. Contrast [Claude Code](../systems/claude-code.md), where the filesystem the agent sees is simply the filesystem of the machine it runs on, and containment is achieved by wrapping the whole process in an OS sandbox as described in the [sandboxing runbook](../runbooks/claude-code-sandboxing.md). Deep Agents enforces policy *inside* the harness at the tool boundary — the same philosophy visible in the [interpreter](deepagents-interpreters.md)'s deny-by-default capability model and in the declarative `FilesystemPermission` allow/deny/interrupt rules layered on top of these backends.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/backends |
| 2026-07-25 | https://docs.langchain.com/oss/python/deepagents/permissions |
