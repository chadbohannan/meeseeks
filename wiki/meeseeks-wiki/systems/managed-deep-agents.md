# Managed Deep Agents

Managed Deep Agents is a hosted runtime for operating code-first [Deep Agents](deep-agents.md) inside [LangSmith](langsmith.md), pairing the OSS harness with managed infrastructure so a production agent can run without standing up an agent server. You author the agent in Python or TypeScript and use an `mda` CLI to scaffold, test, and deploy it. It occupies the top rung of the deployment ladder described on the [production](../concepts/deepagents-production.md) page — and it is the opposite end of the packaging spectrum from [`dcode`](deep-agents-code.md), which is the same harness delivered as a local terminal process.

It is in **private beta**, available on LangSmith Cloud in the US region only, with self-hosted and hybrid deployments unsupported. During the beta it is deliberately **CLI-first**: the docs note that API-driven creation, update, and invocation examples were removed while the API is finalized.

## The ownership split

The defining characteristic is what the runtime takes over. Managed Deep Agents **owns `backend`, `store`, `checkpointer`, `memory`, `skills`, and the system prompt** — and the docs are explicit that these must not be set in the agent definition. The developer keeps `name` (which doubles as the assistant ID and default deployment name), plus model, tools, middleware, subagents, and interrupts.

That split is the whole product. Everything the [backends](../concepts/deepagents-backends.md) page presents as a pluggable choice — where files live, how memory is namespaced, which checkpointer persists threads — is decided by the platform instead. What remains configurable is the agent's *behaviour*, not its *substrate*.

| Path | Use when | You manage | LangSmith manages |
|---|---|---|---|
| **Managed Deep Agents** | A code-first Deep Agent deployed quickly | Agent code, tools, middleware, instructions, schedules, optional identity | Backend, store, checkpointer, memory, skills, sandbox, hosted deployment, identity auth |
| **LangSmith Deployment** | Custom application code, custom routes, advanced auth, stronger isolation, maximum scale | Application code, server, deployment configuration | Hosted infrastructure and scaling |
| **OSS Deep Agents** | Running the harness in your own environment | Everything, including hosting and persistence | Nothing |

## Project structure and the compile step

A Managed Deep Agent is a local directory in which **a file's location determines its role**: the CLI reads the tree to find the agent entry, managed instructions (`instructions.md`), skills (`skills/**`), connectors, messaging channels, schedules, optional identity, sandbox configuration, and local eval tasks, then packages the deploy-owned pieces into a hosted deployment.

`mda dev` and `mda deploy` compile the project into a runnable LangGraph app under `.mda/build`. The agent entry and the modules it imports are **copied without rewriting**, so imports behave exactly as in a normal Python or TypeScript project — a deliberate choice that avoids the debugging confusion a transforming build step would introduce. Secrets and generated files (`.env`, `node_modules`) are excluded from the build.

A deploy validates the project, syncs deploy-owned context to Context Hub, uploads the build, triggers a hosted build, and reconciles cron schedules once the deployment is live. The recommended workflow is `mda init` → author `instructions.md` and the rest → optionally compile Harbor-style [evals](../concepts/langsmith-evaluation.md) with `mda evals compile` → `mda dev` to test in Studio → `mda deploy`.

## Context Hub as the context substrate

Each deployment gets a [Context Hub](../concepts/context-hub.md) repo holding both deploy-owned context and runtime-created memory, and the division between them is the interesting part:

| Agent path | Hub source | Access |
|---|---|---|
| `/instructions.md` | Hub `instructions.md` | Read-only |
| `/skills/**` | Hub `skills/**` | Read-only |
| `/memories/user/**` | One remounted Hub slice | **Read/write** |
| `/memories/org/**` | Hub `org-memory/**` | Read-only |

**Deploy syncs `instructions.md` and `skills/**` but never overwrites `memories/**`.** Instructions and skills are developer-owned and versioned with the project; memory is runtime-owned and survives redeploys. This cleanly resolves the shared-ownership tension that the [`dcode`](deep-agents-code.md) page records as an unresolved problem, where a single `AGENTS.md` is both developer-authored configuration and an agent-writable memory file. Here they are separate paths with separate permissions.

### Hot and cold memory

A **memory slice** is a subdirectory of the Hub `memories/` tree belonging to one scope — an actor (`memories/<actorId>`), a tenant, or the shared agent (`memories/agent`). Exactly one slice is remounted as `/memories/user/`, so the agent never sees a multi-user directory listing.

Within the slice, memory is tiered by *when it loads*. **Hot** memory is `/memories/user/AGENTS.md`, always injected into the system prompt every turn. **Cold** memory is every other file under the slice, read on demand via `read_file`. The guidance follows directly from the cost model: because hot memory is re-sent on every request, it should hold preferences, short cursors, and *pointers* to cold files, while meeting summaries, decision logs, and archives live cold under `/memories/user/archive/`.

Two operational details matter. When a slice is created the runtime seeds `AGENTS.md` with a guidance block instructing the agent to call `edit_file` when a user shares a durable preference — and the docs warn **not to delete that block**, or the agent may stop persisting preferences. And the recommended prompt contract tells the agent to write memory *in the same turn*, before claiming it will remember, and to not claim success if the write fails. The suggested product check for persistence is crisp: after a successful write, a **new thread** for the same caller should recall the fact from hot memory without calling any tools.

## Identity: the multi-tenancy contract

Identity is opt-in — projects without `identity.ts`/`identity.py` deploy unchanged — but adding a declaration wires auth, scoping, and a frozen `runtime.identity` object into tools and middleware. The framing is the strongest statement in these docs about why agents differ from ordinary applications: deep agents "keep durable memory, resume long-running threads, and call tools on the user's behalf," so without identity the failure modes are concrete — Bob's new chat already "knows" Alice's preferences, anyone hitting the deployment can resume another user's conversation, and every user acts through one shared API token.

Three concepts carry the model. An **actor** is the person or service a run is *for* (not the agent). A **tenant** is an optional customer or org boundary (not a LangSmith workspace). **Ingress** is how the runtime learns who is calling. From actor and optional tenant the runtime derives three outcomes: which threads can be opened or resumed, which memory slice is visible, and whose token downstream tool calls use — with `credentials: "actor"` meaning the agent calls GitHub as Alice rather than as a shared bot.

The runtime **fails closed**: a request missing a required actor or tenant is rejected with 403, and it never falls back to shared memory or threads. Scope values are `actor`, `tenant`, `channel`, and `agent`, available through presets. For compliance regimes such as SOC 2, GDPR, or HIPAA, this scoping supplies the data-segregation boundary auditors expect, and `runtime.identity` provides the audit trail. Enabling identity on an existing project does not delete prior data — pre-identity threads remain accessible at agent scope, and migrating older data means exporting and re-creating it under the new rules.

## Sandboxes, schedules, and channels

A [sandbox](../components/langsmith-sandboxes.md) is configured by exporting `sandbox` from `sandbox/index.ts` or `sandbox/__init__.py`, with `sandbox/setup.sh` provisioning it on first creation. Sandboxes default to **one per thread**; setting `scope` to `agent` shares one across the agent process. Connectors can provision files, CLIs, and credentials when a sandbox starts.

Scheduled runs choose thread behaviour explicitly: an *ephemeral* thread is cleaned up after the run, while a *persistent* thread reuses a stable thread ID so state accumulates across executions — the distinction between a stateless cron job and a long-running agent that wakes periodically.

**Channels** are optional modules that mount public provider event URLs on the Agent Server — Slack at `POST /channels/slack/events`, GitHub at `POST /channels/github/events`. The runtime verifies the provider signature, acknowledges delivery, then invokes the graph over trusted loopback with identity stamps and optional auto-reply. Channels **require a root identity declaration**, which is consistent with the fail-closed posture: an inbound webhook cannot run anonymously.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/langsmith/managed-deep-agents-overview |
| 2026-07-25 | https://docs.langchain.com/langsmith/managed-deep-agents-how-it-works |
| 2026-07-25 | https://docs.langchain.com/langsmith/managed-deep-agents-identity |
| 2026-07-25 | https://docs.langchain.com/langsmith/managed-deep-agents-memory |
| 2026-07-25 | https://docs.langchain.com/langsmith/managed-deep-agents-cli |
