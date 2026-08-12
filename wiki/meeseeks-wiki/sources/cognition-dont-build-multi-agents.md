# Don't Build Multi-Agents

Source: https://cognition.com/blog/dont-build-multi-agents
Accessed: 2026-07-27

A June 2025 position piece by Walden Yan of Cognition (makers of the Devin coding agent) arguing, from hands-on production experience, that parallel multi-agent architectures were — at that point in model capability — a reliability trap rather than a shortcut, making it a useful counterweight to more optimistic multi-agent writeups.

## Central argument

Single-threaded agents have real limitations (context limits, serial speed), but Cognition's practical experience was that naively parallelizing into multiple simultaneously-acting agents made things *worse*, not better, because the field (as of mid-2025) lacked mature techniques for passing context and decisions between agents without lossy compression or outright contradiction.

## The two stated principles

1. **"Share context, and share full agent traces, not just individual messages."** Passing a terse summary or a single message between agents drops the reasoning and intermediate decisions that produced it; the receiving agent then has to guess at intent.
2. **"Actions carry implicit decisions, and conflicting decisions carry bad results."** Every action an agent takes (a line of code, a design choice) encodes an implicit decision about style, scope, or approach that wasn't necessarily stated explicitly. When two agents act in parallel without seeing each other's implicit decisions, their outputs diverge in ways that are hard to reconcile after the fact.

## Illustrative failure example

Given the task "build a Flappy Bird clone" split across subagents, one subagent might independently decide to build a Super Mario Bros-style background/theme while a second subagent builds an unrelated generic bird sprite based on its own reading of the ambiguous spec. Neither followed a shared, explicit specification, so the final integrating agent is left trying to reconcile two incompatible halves of a product — an integration problem that is often harder than just writing the thing in one pass would have been.

## Recommended architectures (in order of maturity/safety)

1. **Linear single-threaded design** — simplest, keeps continuous context, but risks context-window overflow on very large tasks.
2. **Compressed-history model** (more advanced) — an LLM periodically compresses the conversation/task history into key decisions and events, allowing effectively longer working context while trying to preserve decision coherence, without fanning out into parallel independent actors.
3. **Avoid pure parallel-write multi-agent setups** — the piece is explicit that multiple agents discussing/making decisions concurrently is not yet reliable given 2025-era model capability for cross-agent context sharing.

## How Claude Code was cited as a counter-example done right

The piece notes that Claude Code (Anthropic's own coding agent) deliberately avoids parallel subagents that independently *write*. It restricts subagent delegation to answering scoped questions rather than doing independent code-writing — which sidesteps the conflicting-implicit-decisions problem while still getting some benefit of delegation, and relies on history compression rather than agent fan-out for handling long tasks.

## Conclusion / forward-looking claim

Yan states multi-agent collaboration will likely work eventually, but current (2025) LLM capability for distributed decision-making isn't there yet. The suggested path is to make single-threaded agents better first (improving context compression, decision coherence over long horizons), and expect that a more capable single-agent foundation will make parallelism "unlock naturally" later — i.e., parallelism is a scaling technique to add on top of a solid single-agent architecture, not a substitute for one.

Notably, roughly ten months after this post, Cognition published a follow-up ("Multi-Agents: What's Actually Working," see the companion source file in this wiki) walking back the blanket "don't" and describing a narrower class of patterns — where multiple agents contribute intelligence but writes stay single-threaded — that they found did work in production. The two posts should be read together; the second doesn't contradict the core principles here (shared context, single locus of writes) so much as it operationalizes them into working patterns.
