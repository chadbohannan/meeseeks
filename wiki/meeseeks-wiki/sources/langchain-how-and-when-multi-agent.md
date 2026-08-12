# How and when to build multi-agent systems

Source: https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems
Accessed: 2026-07-27

A LangChain engineering blog post that synthesizes lessons from Anthropic's and Cognition's public multi-agent writeups into practical guidance for practitioners deciding whether to reach for a multi-agent architecture at all, making it a useful "meta" source that cross-references the other primary reports in this collection.

## Core framing: context engineering as the foundational problem

The post treats "context engineering" — ensuring each agent receives the right contextual information at the right time — as the central hard problem underlying multi-agent design, explicitly framed as an evolution beyond simple prompt engineering. Multi-agent architectures make this harder by definition, because context is now fragmented across multiple components instead of living in one place.

It cites Anthropic's finding (see `anthropic-multi-agent-research-system.md` in this directory) that vague top-level task instructions like "research the semiconductor shortage" caused subagents to duplicate work and misinterpret their assigned scope, and that the fix was highly explicit task specifications: objective, output format, tool guidance, explicit boundaries.

## Core distinction: read-heavy vs. write-heavy systems

The post's key organizing claim: **read operations (research, analysis, information-gathering) parallelize naturally across agents; write operations (coding, content generation) create coordination problems when distributed.** This directly echoes Cognition's "actions carry implicit decisions" principle: conflicting reads just produce redundant or inconsistent information that's cheap to reconcile, but conflicting writes produce incompatible artifacts that require expensive manual reconciliation.

Anthropic's research system is cited as the canonical example of getting this right: parallel subagents are used for the read-heavy/parallelizable part (research), while synthesis into a single final answer is concentrated in one main agent — never distributed.

## When multi-agent architectures are worth it (per Anthropic's own evaluation, restated here)

- **Breadth-first queries** — tasks that decompose into multiple genuinely independent directions of investigation.
- **Token/context scaling** — tasks whose total working context would exceed what fits in a single agent's context window.
- **Highly parallelizable work** with minimal cross-agent dependencies.
- **High-value tasks**, because multi-agent systems have materially higher token cost than single-agent — the value of the outcome has to justify that premium.

## When they don't work

- **Tightly coupled tasks** that require every agent to share full context continuously.
- **Dense coordination requirements**, where correctly delegating and tracking sub-task state becomes its own hard problem.
- **Most coding tasks**, explicitly called out — because code changes are sequentially dependent in ways research questions usually aren't.

## Engineering prerequisites called out as "essential," not optional

- **Durable execution / error recovery**: long-running agents accumulate state across many tool calls; production systems need to resume from a failure point rather than restart the whole task, both to avoid cascading failures and to avoid expensive redundant work exposed to the end user.
- **Observability and debugging**: because agents are non-deterministic even given identical prompts, production tracing is necessary to distinguish whether a failure came from bad query generation, bad source/tool selection, or an outright tool failure.
- **Evaluation frameworks**: the post repeats Anthropic's evaluation recipe almost verbatim — start with a small eval set (~20 datapoints is enough to detect large effect sizes early), use LLM-as-judge for scale, but keep a human-evaluation step because automated grading systematically misses certain failure classes (hallucination on edge cases, systematic source-selection bias, etc.).

## Practical takeaway

The post's explicit conclusion is that there is "not a one-size-fits-all solution" — the architectural choice should be driven by whether the task is read-heavy/parallelizable or write-heavy/sequential, not by a general preference for or against multi-agent designs. It argues the industry's real gap is tooling: teams need off-the-shelf infrastructure for durable execution, debugging, observability, and evaluation so they can focus engineering effort on domain logic instead of re-solving these generic multi-agent infrastructure problems from scratch on every project (a direct pitch, unsurprisingly, for LangGraph as that infrastructure layer).
