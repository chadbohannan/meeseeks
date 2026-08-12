# CodeCRDT: Observation-Driven Coordination for Multi-Agent LLM Code Generation

Source: https://arxiv.org/html/2510.18893
Accessed: 2026-07-27

A directly Meeseeks-relevant paper: it studies parallel LLM coding agents that coordinate by watching shared CRDT state rather than exchanging messages, giving concrete, measured data on when parallel multi-agent code generation helps or hurts versus sequential single-agent generation.

## Core idea

CodeCRDT lets multiple LLM agents write concurrently into a shared, observable, deterministically-converging data structure (a CRDT — Conflict-Free Replicated Data Type) instead of coordinating via explicit inter-agent messages or a central lock-holding orchestrator. Agents detect what work remains and what others have already done purely by observing changes to the shared state, then act — the classic "stigmergic" pattern transplanted into LLM code generation.

## Motivation: why prior multi-agent coding approaches don't parallelize well

The authors identify three recurring failure modes in existing multi-agent LLM code-gen systems:
1. Sequential workflows that preclude any real concurrent execution.
2. Centralized bottlenecks introduced by lock-based coordination (a single arbiter agent or lock manager becomes the throughput ceiling).
3. Conflict resolution deferred to expensive merge-time reconciliation (agents work in isolation and pay a large cost stitching results together afterward).

They note that "observation-driven coordination" is a decades-old distributed-systems pattern and ask whether it transfers to autonomous LLM agents working on a shared code artifact.

## The formal TODO-claim protocol

Task assignment is implemented as optimistic writes into a shared CRDT map using Last-Writer-Wins (LWW) register semantics:
1. Agents continuously scan the shared state for pending, unassigned TODO markers.
2. An agent optimistically writes its own ID into `TODO_k.assignedTo`.
3. After a 50ms CRDT synchronization delay, the agent re-reads the assignment field.
4. The agent proceeds with implementation only if it observes *its own* ID as the current value of `assignedTo`.

**Safety proof:** the authors show that "at any point after convergence, at most one agent per TODO succeeds," because the underlying CRDT (Yjs) resolves concurrent writes deterministically via a (logical clock, clientID) lexicographic ordering — all replicas converge to the identical winner, so no two agents can both believe they own the same TODO.

## Lineage: how this relates to older coordination patterns

The paper explicitly situates itself against three historical traditions and argues it improves on each:
- **Linda tuplespaces (1985)** — pioneered coordination via shared associative memory, but lacked formal convergence guarantees and required locking.
- **Blackboard architectures (e.g., Hearsay-II)** — let agents coordinate via shared problem-solving state, but required centralized serialization rather than deterministic decentralized convergence.
- **Stigmergy in multi-robot systems** — coordination via environment modification (virtual pheromones), but without formal consistency guarantees or deterministic convergence properties.

CodeCRDT's claimed advance is combining (1) formal safety guarantees via strong eventual consistency (SEC), (2) deterministic convergence with no centralized arbitration, and (3) empirical characterization of performance across varied task structures — a combination the authors say is absent from the prior art.

## System architecture

- **Inference service** — manages the task queue and agent lifecycle.
- **Shared CRDT state** — a Yjs document reachable over WebSocket, containing three CRDT types: `Y.Text` (the code document itself, converging character-by-character via deterministic operation ordering), `Y.Map` (TODO assignment / agent coordination state via LWW registers), and `Y.Array` (an append-only, causally-ordered audit trail).
- **Agent roles** — an *Outliner* generates a TypeScript/React skeleton containing TODO placeholders; *Implementation agents* claim and fill individual TODOs; an *Evaluator* scores the resulting code quality.
- **TODO Observer** — a real-time scanner that surfaces unassigned TODOs as coordination entry points for idle agents.

## Experimental design

Six TypeScript/React benchmark tasks, deliberately varied by component interdependency ("coupling"):
- **High coupling (>50%)**: Pomodoro Timer, Dashboard, Algorithm Visualizer.
- **Low coupling (<30%)**: Tic-Tac-Toe, Registration Form, Markdown Editor.

Each task was run 50 times in each of two modes (sequential, parallel) using Claude Sonnet 4.5 — 600 trials total. Metrics: end-to-end response time, and LLM-judged quality across five dimensions (code quality, architecture, performance, accessibility, functionality; 0–20 points each). Statistics used per-task Wilcoxon signed-rank tests combined via fixed-effects meta-analysis with inverse-variance weighting; outliers removed via IQR (13.8% of response-time points dropped); Bonferroni correction applied (α = 0.05/6).

## Key results

**Raw performance (RQ1):** highly task-dependent — from a 21.1% *speedup* (Tic-Tac-Toe) to a 39.4% *slowdown* (Algorithm Visualizer), averaging a 13.1% overall slowdown for parallel vs. sequential. But this raw number conflates two effects: parallel runs also produced substantially more code (82–189% more, attributed to agents redundantly adding optimizations/safety checks). When response time is normalized by code volume (time per character generated), parallel wins for 5 of 6 tasks, by 11–52%.

**Code quality (RQ2):** parallel coordination improved the *performance* dimension strongly (+25%, Cohen's d = 1.51, large effect) but *hurt* code quality (-7.7%, d = -0.71, medium effect) and accessibility (-5.6%, d = -0.59). Static analysis of TypeScript errors showed 5 of 6 tasks improved (47–87% error reduction) under parallel generation, while one task (Markdown Editor) got 24% worse. The authors interpret this as "parallel agents optimize locally, producing more robust but verbose code."

**Consistency (RQ3):** the CRDT substrate delivered perfect convergence — 100% completion across all 600 trials, zero character-level merge conflicts requiring manual resolution. However, manual inspection of a 10% sample (60 runs) found roughly 5–10% *semantic* conflicts (duplicate declarations, type mismatches, broken references) that CRDTs cannot detect because they operate below the semantic level.

## Scalability analysis

Three distinct overhead sources bound how many agents can usefully coordinate this way:
1. **CRDT metadata overhead** — O(N×operations), manageable up to roughly 50 agents.
2. **Observation processing** — O(N×updates), the dominant bottleneck, becoming significant around N≈25–30 agents since every state update triggers callbacks in all N agents.
3. **Context invalidation thrashing** — O(N×k) for interdependent tasks, severe at N >> 10.

Projected optimum: 3–5 agents for suitable (low-coupling) tasks, with peak speedup (~2.05×) around N=3, degrading to break-even around N≈20 agents.

## Failure modes specific to LLM agents (vs. classical distributed systems)

- **Semantic conflicts** despite zero character-level conflicts (duplicate function declarations, type mismatches).
- **Code volume inflation** — 82–189% more code on complex tasks, apparently from independent, redundant safety/optimization additions by different agents.
- **High latency variance** — ±21.57 seconds variance in generation time even at temperature=0.

## Limitations noted by the authors

- Internal validity threatened by LLM stochasticity/latency variance and by the fact that parallel runs generate more code, conflating "more work done" with "coordination overhead" (partially addressed via the normalized-time analysis).
- External validity limited to small UI-focused TypeScript/React tasks (<100 LOC), a single language/framework, and at most 5 agents tested.
- Construct validity limited by coupling being assessed via manual inspection rather than an objective metric, and semantic-conflict rate estimated from only a 10% sample.

## Conclusion and generalization

The authors conclude that observation-driven coordination — a decades-old distributed-systems pattern — does transfer successfully to concurrent multi-agent LLM code generation, with real caveats: parallel is faster per unit of code produced (11–52% for 5/6 tasks) but raw wall-clock time is task-dependent (ranging from a 21% speedup to a 39% slowdown). They argue the contribution generalizes beyond CRDTs specifically to any substrate offering observable updates and deterministic convergence (e.g., operational transformation systems, replicated logs), and that component interdependency ("coupling") of the task is the primary determinant of whether parallel multi-agent coordination succeeds or fails.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/html/2510.18893 |
