# Log

[2026-04-26] ingest | code-rag bootstrap — initial wiki structure from codebase indexing.
[2026-04-26] lint | link integrity, orphan check, cross-reference verification.
[2026-04-26] enrich | code-rag:meeseeks — route endpoints, error codes, storage functions.
[2026-04-26] update | [Web UI](components/web.md) — added after implementing Vite+React SPA.
[2026-04-26] update | [Runtime](components/runtime.md) + [Console](components/console.md) — added after implementing supervisor + xterm panels.
[2026-04-26] enrich | [Project Setup](runbooks/project-setup.md) — verified setup/run commands, env vars, deployment.
[2026-04-27] lint | fixed 6 broken links, stale deferred-features list, runtime-state contradictions between concepts/ and components/runtime.md.
[2026-04-27] lint | fixed 2 out-of-wiki links; enriched storage.md (error codes), server.md (WsHub broadcast), runtime.md (RingBuffer, termination timeout).
[2026-04-27] update | project.yaml replaces project.meeseeks (legacy fallback retained); picker UI removed. Updated project-model.md, web.md, project-setup.md.
[2026-04-27] lint | verified 37 links; fixed RingBuffer size contradiction (1MB→2MB per code); resolved 2 orphans.
[2026-04-27] lint | verified 32 links; fixed permissions.yaml location contradiction (board→lane dir, per src/storage/lane.ts).
[2026-04-28] update | runtime state signalling — Notification hooks + startup debounce added after diagnosing `starting` never transitioning. Updated runtime.md, added awaiting-user.
[2026-04-28] ingest | Claude Code client integration — created components/claude-code-client.md (modes, flags, settings, hook matchers, stream-json, awaiting-user/idle).
[2026-04-28] lint | corrected 6 stale items across CLAUDE.md and runtime.md (shipped features, project.yaml rename, --append-system-prompt).
[2026-04-28] ingest | debugging session — created [Platform Constraints](concepts/platform-constraints.md) (chokidar/node-pty macOS issues, FORCE_COLOR leakage); updated runtime.md, claude-code-client.md, project-setup.md.
[2026-04-28] update | state signalling overhaul — hooks are sole authority for idle/awaiting-user; removed PTY-driven transitions; expanded claude-code-client.md hook inventory.
[2026-04-28] ingest | `claude -h` — updated claude-code-client.md: --model alias behavior, unused-flags section (--permission-mode, --effort, --worktree).
[2026-04-28] lint | fixed 4 stale project.meeseeks references; corrected runtime.md lifecycle summary.
[2026-04-29] ingest | web docs on soft-sandboxing — created [Claude Code Sandboxing](runbooks/claude-code-sandboxing.md) (permission modes, dontAsk, OS-level sandboxing, additionalDirectories).
[2026-04-30] enrich | [Claude Code vs. Pi](syntheses/claude-vs-pi-runtime-interfaces.md) — comparative gap analysis via code-rag of pi-mono RPC/extension/session/sandbox interfaces.
[2026-04-30] ingest | [Claude Context](sources/Claude%20Context.md) — `.claude/` directory structure, instruction bootstrapping, best practices; updated claude-code-client.md, sandboxing runbook.
[2026-05-03] ingest | one-shot prompts (commit 32c8f2b) — created [One-Shot Prompts](concepts/one-shot-prompts.md); updated runtime.md, server.md, storage.md, web.md, architecture-overview.md.
[2026-05-03] lint | corrected stale claims in console.md (Dock rendering) and web.md (body editor, DnD).
[2026-05-03] lint | corrected 5 more stale items: server.md WS events, console.md status-dot scope, claude-code-client.md stream-json transitions, 2 broken source-link paths, project-setup.md tsx exclusions.
[2026-05-03] lint | corrected one-shot-prompts.md (result payload capture) and runtime.md (init transition / idle-signal attribution) against code.
[2026-05-03] ingest | [code.claude.com/settings](https://code.claude.com/docs/en/settings) — added permission path syntax (`//`, `/`, `~`) to claude-code-client.md.
[2026-05-11] update | board CLAUDE.md renamed to CONTEXT.md — runtime adapter now injects it explicitly via --append-system-prompt rather than relying on auto-discovery. Legacy boards auto-migrate.
[2026-05-19] ingest | markdown editor focus-gating fix — created [Focus-Gated Editor](concepts/focus-gated-editor.md); updated web.md, storage.md.
[2026-06-08] update | config-driven model picker — GET /api/models backed by project.yaml `models:` key, motivated by a corporate gateway with no reusable ANTHROPIC_API_KEY. Documented in project-model.md.
[2026-06-28] ingest | code-rag: pi-mono/packages/agent — created [Pi Agentic Loop](concepts/pi-agentic-loop.md) and [Pi Agentic Loop Design Patterns](syntheses/pi-agentic-loop-design-patterns.md).
[2026-07-11] ingest | [docs.langchain.com](https://docs.langchain.com/) — bootstrapped LangChain ecosystem as a third candidate harness: langchain-ecosystem.md, langgraph-durable-execution.md, langgraph-agent-server.md, langchain-as-meeseeks-harness.md.
[2026-07-11] ingest | [docs.langchain.com](https://docs.langchain.com/) — full LangChain digest: create-agent/models/tools components; messages/middleware/memory/retrieval/streaming/multi-agent/mcp/graph-api/HITL/observability/evaluation concepts; deep-agents.md, langsmith.md.
[2026-07-11] lint | fixed a broken `../sources/` link in log.md; confirmed two others were false positives (unescaped %20).
[2026-07-11] enrich | [docs.langchain.com](https://docs.langchain.com/) — added [Build vs. Supervise](syntheses/harness-sdk-build-vs-supervise.md) and [Tracing to LangSmith](runbooks/tracing-meeseeks-sessions-to-langsmith.md).
[2026-07-11] enrich | `src/runtime/` (direct read) — grounded langchain-as-meeseeks-harness.md's state-detection and persistence claims in actual supervisor source (hooks, ring buffer, runtimes Map).
[2026-07-11] enrich | [code.claude.com/settings](https://code.claude.com/docs/en/settings) — documented ephemeral-vs-durable permission distinction on the sandboxing runbook.
[2026-07-11] ingest | [docs.langchain.com](https://docs.langchain.com/) — gap-fill: [Frontend Rendering](concepts/langchain-frontend-rendering.md), [LangGraph Fault Tolerance](concepts/langgraph-fault-tolerance.md), [Guardrails](concepts/langchain-guardrails.md).
[2026-07-11] enrich | deepened langchain-frontend-rendering.md: full pattern catalog, join/rejoin = dismiss-without-kill, headless tools, component ecosystem.
[2026-07-11] lint | wove inbound frontend-rendering cross-references from console.md, web.md, human-in-the-loop.md.
[2026-07-11] enrich | [langgraph/interrupts docs](https://docs.langchain.com/oss/python/langgraph/interrupts) — resolved stream.interrupt vs stream.interrupts as two layers, not a contradiction.
[2026-07-11] update | split oversized claude-code-client.md into three: [state-detection](concepts/claude-code-state-detection.md), [instruction-bootstrapping](concepts/claude-code-instruction-bootstrapping.md), slimmed client page.
[2026-07-11] update | harness-category normalization — moved claude-code-client.md → systems/claude-code.md, created systems/pi.md as the Pi hub; rewired all inbound links.
[2026-07-11] enrich | created capstone [Harness Paradigms](syntheses/harness-paradigms.md) — supervised-CLI (Claude Code, Pi) vs. framework/server (LangChain).
[2026-07-11] enrich | [langsmith/background-run](https://docs.langchain.com/langsmith/background-run) — grounded the API-client claim in concrete SDK calls on langgraph-agent-server.md.
[2026-07-11] enrich | [oss/javascript quickstart](https://docs.langchain.com/oss/javascript/langchain/quickstart) — added JS/TS embed path to langchain-create-agent.md; corrected two now-false claims in langchain-as-meeseeks-harness.md (JS parity, embedded durability).
[2026-07-11] enrich | `src/runtime/`, `src/storage/board.ts` (direct read) — verified Meeseeks has no harness-adapter abstraction; added "Harness coupling" section to runtime.md.
[2026-07-11] lint | full health check, 48 pages — 0 broken links, no orphans; fixed one contradiction in harness-sdk-build-vs-supervise.md (JS-parity); repointed meeseeks.md hub links.
[2026-07-11] update | langchain-models.md — added scope note: per-provider pages (incl. NVIDIA) deliberately not ingested; not evidence of absence.
[2026-07-11] enrich | direct read of `src/web/` — substantially enriched web.md (console byte pipeline, LangChain-refactor blast-radius mapping).
[2026-07-16] enrich | design discussion — created [Attention Economics](syntheses/attention-economics.md), the first product-design synthesis: durability/observability as attention-manufacturing capabilities, separable from the paradigm migration.
[2026-07-24] ingest | [docs.langchain.com](https://docs.langchain.com/oss/python/deepagents/code/overview) — `dcode` grown from a stub to a full subtree. Created [Deep Agents Code](systems/deep-agents-code.md) (durable threads, hooks.json, approval modes, goals/rubrics). Qualified harness-paradigms.md; corroborated attention-economics.md's separability claim.
[2026-07-25] ingest | [docs.langchain.com](https://docs.langchain.com/oss/python/deepagents/code/config-file) — closed tier-1 `dcode` gaps (memory-and-skills, credentials, config-file, providers, mcp-tools). Corrected deep-agents-code.md: AGENTS.md IS appended to the system prompt (shared-ownership problem, not a missing seam); 6 skill roots, not 4.
[2026-07-25] ingest | [docs.langchain.com](https://docs.langchain.com/oss/python/deepagents/overview) — six new pages, standalone subject matter: Backends, Interpreters, Delegation, Production, [Managed Deep Agents](systems/managed-deep-agents.md), [LangSmith Sandboxes](components/langsmith-sandboxes.md), Context Hub (all under concepts/deepagents-*.md unless linked).
[2026-07-25] ingest | [context-engineering docs](https://docs.langchain.com/oss/python/deepagents/context-engineering) — created [Context Engineering](concepts/deepagents-context-engineering.md) (9-part prompt assembly, dual summarization) and [Customization](concepts/deepagents-customization.md) (middleware stack ordering, harness profiles).
[2026-07-25] enrich | created [Two Attention Economies](syntheses/context-economics.md) — Deep Agents' context window and Meeseeks' human focus as the same resource-economy; dual summarization as the fix for the lossy ring buffer; asymmetric retrieval cost inverts the eviction policy.
[2026-07-25] update | progressive disclosure — corrected context-economics.md: skills are not the only mechanism (memory pages confirm it's a general pattern). Meeseeks needs only the index half (CONTEXT.md restructured), not a skills subsystem.
[2026-07-25] update | [code.claude.com/docs](https://code.claude.com/docs/en/commands) — user flagged a missing `/goal` command; review found systems/claude-code.md badly stale (April capture, adapter-flags lens only). Added full [capability surface](systems/claude-code.md#capability-surface): /goal, session/checkpoint commands, skills (Agent Skills standard), /model, observability, portability.
[2026-07-25] lint | contradiction sweep from the Claude Code review — corrected 4 false claims resting on the stale capture: Pi/Claude session-persistence parity, model-switching, harness-paradigms persistence row, dcode goals/skills framing.
[2026-07-25] update | [code.claude.com/memory](https://code.claude.com/docs/en/memory) — corrected claude-code-instruction-bootstrapping.md (built from a stale secondary source): auto-memory location, command naming, 4-scope concatenation (not 3-layer override). Added "Two memory systems" section; noted Claude Code doesn't read AGENTS.md.
[2026-07-26] enrich | code-rag: pi-mono (re-indexed) — closed the Pi memory/skills gap. Added "Memory and skills" to systems/pi.md: AGENTS.md/CLAUDE.md context files, Agent Skills standard, and the sharpest finding — Pi deliberately has no separate memory system, treating the session log as all durable state.
