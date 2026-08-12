# How we built our multi-agent research system

Source: https://www.anthropic.com/engineering/multi-agent-research-system
Accessed: 2026-07-27

Anthropic's own engineering account (published June 13, 2025) of building the orchestrator-worker multi-agent system that powers Claude's Research feature — the single most detailed, quantified production writeup available on running an LLM multi-agent system at scale, and the reference point nearly every other source in this collection cites.

## System architecture

The system uses an **orchestrator-worker pattern**: a LeadResearcher agent coordinates specialized subagents that operate in parallel. Given a user query, the LeadResearcher analyzes it, develops a research strategy, and spawns multiple subagents to explore different facets simultaneously. This is explicitly contrasted with traditional RAG, which does static single-shot retrieval; here the system performs multi-step search that dynamically finds information, adapts to new findings mid-task, and analyzes results before deciding what to do next.

The LeadResearcher runs an iterative loop: think through the approach, save the plan to memory (important because the effective context is bounded — at the time, Claude's 200k token context could still be exhausted over a long research task), spin up subagents with specific delegated tasks, and synthesize their returned findings. A dedicated **CitationAgent** runs afterward to attribute claims in the final answer back to sources. Subagents use "interleaved thinking" — reasoning between tool calls — to evaluate result quality and refine their own queries independently rather than reporting raw results back up.

Rather than routing all inter-agent communication through the lead agent's context, subagents can write outputs to an external "artifact" system and pass back lightweight references. This avoids repeated summarization/re-summarization losses and reduces token overhead — a specific fix for information degrading as it passes through multiple stages of a pipeline.

## Concrete numbers

- A system with **Claude Opus 4 as lead** and **Claude Sonnet 4 as subagents** beat a single-agent Opus 4 baseline by **90.2%** on their internal research evaluation.
- In their BrowseComp-style evaluation, **token usage alone explained ~80% of the variance** in performance; model choice and number of tool calls explained most of the rest (~15%).
- Multi-agent systems consume roughly **15× the tokens of a normal chat interaction**; a single agent using tools already runs about **4×** a plain chat.
- Parallel tool calling cut research time for complex queries by **up to 90%** versus sequential execution.
- Their conclusion on economics: multi-agent setups only make sense "where the value of the task is high enough to pay for the increased performance" — this is a direct cost/quality tradeoff statement, not a throwaway line.

## Prompt-engineering lessons (numbered principles they published)

1. **Build an accurate mental model of the agent** — they built a Console-like simulation that replayed exact prompts/tools step by step, which surfaced failure patterns like subagents continuing to search after they already had sufficient information, or issuing overly verbose queries.
2. **Teach explicit delegation** — vague top-level instructions like "research the semiconductor shortage" caused duplicated work and misinterpreted scope between subagents. The lead agent needed to hand out detailed task descriptions: objective, expected output format, tool guidance, and explicit task boundaries.
3. **Scale effort to query complexity** — they hard-coded heuristics: simple fact-finding → 1 agent, 3-10 tool calls; direct comparisons → 2-4 subagents, 10-15 calls each; complex multi-part research → 10+ subagents with divided responsibilities.
4. **Tool design matters as much as prompts** — agents misused ambiguous or overlapping tools. Heuristics were added: inspect all available tools before acting, match tool choice to explicit intent, prefer specialized tools over generic fallbacks. A dedicated "tool-testing agent" whose only job was refining tool descriptions cut future task completion time by **40%**.
5. **Let the model improve its own prompts** — Claude was effective at diagnosing why its own prior prompt attempts failed and rewriting tool descriptions/instructions to avoid the same mistake next time.
6. **Mirror expert research strategy** — start broad, assess what's available, then progressively narrow — rather than firing narrow queries first and getting no results.
7. **Use extended/interleaved thinking as a controllable scratchpad** — the lead agent thinks explicitly about approach, tool fit, query complexity, and subagent role division; subagents think after each tool result to judge quality and spot gaps before continuing.
8. **Parallelize at two levels** — (a) the lead agent launches 3-5 subagents concurrently instead of serially, and (b) each subagent itself issues 3+ tool calls in parallel rather than one at a time.

## Evaluation methodology

They started with a **small set of ~20 representative queries** for rapid iteration, arguing that early-stage prompt/architecture changes produce large effect sizes (30-80 percentage point swings in success rate), so small samples are enough to detect them before investing in larger eval sets.

For scoring they used an **LLM-as-judge** against a rubric covering factual accuracy, citation accuracy (does the cited source actually support the claim), completeness, source quality (preferring primary sources over SEO content-farm pages), and tool-call efficiency. They found a **single LLM call outputting one 0.0-1.0 score was more consistent** than decomposing into multiple specialized judge calls.

Human evaluation remained necessary to catch things automated grading missed: hallucinated answers on unusual queries, outright system failures, and a systematic bias where agents preferred SEO-optimized content-farm sources over authoritative academic/primary sources — a finding that directly fed back into the source-quality rubric heuristics.

## Production engineering challenges

- **State and error compounding**: agents hold state across many sequential tool calls over long horizons; without mitigation, small failures cascade into full task failure. Rather than restarting from scratch (expensive), the system resumes execution from the last good checkpoint. This combines model-level adaptability (telling the agent a tool call failed so it can route around it) with deterministic safeguards like retry logic.
- **Debugging non-determinism**: identical prompts don't guarantee identical agent runs. They built full production tracing that captures decision patterns and interaction structure but deliberately **without** logging conversation content, preserving user privacy while still enabling root-cause diagnosis of systemic failure patterns.
- **Deployment**: they describe agents as "highly stateful webs of prompts, tools, and execution logic," and use **rainbow deployments** — gradually shifting traffic between old and new versions rather than hard cutovers — specifically to avoid killing or corrupting in-flight agent runs.
- **Synchronous bottleneck**: as implemented, the lead agent blocks synchronously until all subagents finish before proceeding, which prevents mid-run steering. They flag async execution as a future direction, at the cost of added coordination/state-consistency complexity.

## Where multi-agent helps vs. hurts

Multi-agent architecture wins for: **breadth-first** queries that can be split into independent parallel investigations, tasks whose total context exceeds a single context window, and heavily parallelizable work. It loses for tasks requiring **tightly shared context across all agents** and tasks with **dense sequential dependencies** — they explicitly call out that this describes **most coding tasks**, which is why Claude Code (a separate Anthropic product) does not use this same parallel-subagent-writes pattern.

They also note an **emergent-behavior risk**: small edits to the lead agent's prompt can unpredictably change subagent behavior downstream, which argues for investing in the collaboration *framework* (shared conventions, task templates, effort budgets) rather than trying to control behavior through ever more detailed rigid instructions.

## Notable closing claim

"The last mile often becomes most of the journey" — they state explicitly that going from a working prototype to a production-reliable system took substantially longer than building the initial working version, and required parallel investment in evaluation, prompt design, operational tooling (tracing, deployment strategy), and cross-functional review.
