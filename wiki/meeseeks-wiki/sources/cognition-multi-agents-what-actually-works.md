# Multi-Agents: What's Actually Working

Source: https://cognition.com/blog/multi-agents-working
Accessed: 2026-07-27

Cognition's (makers of Devin) follow-up post, roughly ten months after their earlier "Don't Build Multi-Agents," describing specific multi-agent patterns they found do work reliably in production — the most concrete, pattern-level production guidance in this source set on *how* to structure multi-agent systems rather than *whether* to.

## Core reconciling principle

The earlier post's warning still holds as a general rule, but Cognition narrowed it: multi-agent setups work when **writes stay single-threaded** even while **multiple agents contribute intelligence** to the decision. I.e., you can have many agents reasoning, reviewing, and advising, as long as only one locus of agents/agent is actually mutating the shared artifact (usually code) at a time. Parallel-write setups, where multiple agents simultaneously produce conflicting changes to the same artifact, remain the failure mode to avoid.

## Pattern 1: Code review loop

A dedicated review agent examines code that a primary coding agent just wrote. In production this caught an average of **~2 bugs per pull request**, of which roughly **58% were classified as severe** (logic errors, missing edge cases, security vulnerabilities) rather than cosmetic nitpicks.

Counterintuitive finding: the review agent performs *better* with **no shared context** from the coding agent's own trajectory beforehand. Reasons given:
- A reviewer that saw the coder's reasoning tends to inherit its blind spots/biases rather than independently verifying.
- Long shared context risks "context rot" — degraded effective reasoning quality as context length grows — so a clean, short context for the reviewer keeps it sharper.
- A reviewer starting fresh is more likely to question assumptions the original coder silently baked in from an ambiguous instruction, rather than rubber-stamping them.

The primary coding agent, not the reviewer, then decides which flagged bugs to actually fix, filtered against overall user intent — this keeps the reviewer's output advisory rather than an uncontrolled trigger for scope creep or endless review-fix loops.

## Pattern 2: "Smart friend" escalation

A cheaper/faster primary model calls out to a stronger model when it hits a hard decision, rather than every step running on the expensive model.

Problems this pattern still has:
- The weaker model has to learn *when* escalation is actually warranted (both over- and under-escalating are costly).
- Context has to be handed to the stronger model without either overwhelming it or losing the material fact.
- The stronger model's answer has to come back in a form the weaker model can actually act on.

Cognition found this pattern worked well specifically when **both models were frontier-level** (their example: Claude and GPT-4 used together) — in that regime it effectively functions as a **capability router keyed to task type**, not a strict difficulty escalation ladder. When the primary model was meaningfully weaker than the "smart friend," the pattern underperformed; they attribute this to a training/model-capability gap they expect future model generations to close, not an architectural dead end.

## Pattern 3: Manager delegation (map-reduce-and-manage)

A manager agent decomposes a large task (spanning multiple PRs or services) into smaller units, spawns child agents to execute them, and coordinates/synthesizes progress — described as a "map-reduce-and-manage" structure: split work, execute in pieces, then synthesize results centrally.

Challenges observed:
- Managers without sufficient codebase context default to **over-prescribing** exactly how children should do their subtask, which defeats the point of delegating judgment.
- Child agents can't safely assume shared state with siblings or the manager unless it's made explicit — nothing is shared by default.
- Cross-agent communication (e.g., one child agent discovering something that affects a sibling's work) does not happen automatically and has to be deliberately engineered.

## Two reinforced context-engineering principles

1. Share the **maximum reasonable context** between agents so they stay aligned on information, plan, and task understanding — the single-context-trace principle from the earlier post, still load-bearing.
2. Remember that **actions carry implicit decisions** — whenever multiple agents write concurrently, their differing implicit style/pattern/scope decisions fragment the outcome. This is why every working pattern above keeps writes single-threaded even when multiple agents are "thinking."

## Business/market context given

Cognition reported roughly **8x growth in Devin usage over six months** in their largest enterprise segment, attributed to: models becoming more naturally agentic on their own, growing cost-sensitivity as more capable (and pricier) models arrive, and users organically experimenting with multi-agent setups at larger scale once single-agent workflows matured.

They caution that flashy demos (e.g., a 200,000-line web browser or 100,000-line C compiler built "by agents") are misleadingly easy because they have simple, cleanly verifiable success criteria (does it compile, does it pass the test suite) — real production software requires reproducing human taste and judgment calls that don't reduce to a single verifiable metric, which is exactly where naive parallel multi-agent writing breaks down.

## Open problems (framed as communication problems, not model-capability dead ends)

- How a weaker model learns the right threshold for escalating to a stronger one.
- How a child agent signals a discovery that should change what its siblings are doing, without a central bottleneck.
- Techniques for transferring context between agents that don't overwhelm the receiving agent's effective context budget.

Cognition frames all of these as solvable through some mix of better prompt/context engineering now and better-trained models later, rather than as evidence multi-agent systems are fundamentally unworkable — a direct softening of the stance in their earlier "Don't Build Multi-Agents" post.
