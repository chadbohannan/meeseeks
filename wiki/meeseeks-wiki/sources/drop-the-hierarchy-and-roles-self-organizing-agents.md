# Drop the Hierarchy and Roles: How Self-Organizing LLM Agents Outperform Designed Structures

Source: https://arxiv.org/abs/2603.28990 (PDF: https://arxiv.org/pdf/2603.28990)
Accessed: 2026-07-27

A large-scale computational experiment that directly pits externally-imposed, pre-assigned agent roles/hierarchies against self-organizing coordination protocols, concluding — with an explicit caveat about model capability — that self-organization wins for capable models while rigid structure still helps weaker ones.

## Research question

The paper asks how much autonomy multi-agent LLM systems can sustain, and what enables it, by comparing coordination protocols that range from fully externally-imposed hierarchy (roles assigned a priori, e.g. "architect," "analyst," "reviewer," fixed before the task starts) to fully emergent self-organization (agents negotiate and adopt roles at runtime, with no pre-assignment).

## Scale and methodology

The experiment is unusually large for this literature: roughly **25,000 tasks**, spanning **8 different underlying models** (a mix of closed- and open-source), team sizes from **4 to 256 agents**, and **8 distinct coordination protocols** positioned along the hierarchy-to-self-organization spectrum. This breadth is what lets the authors make claims about scaling behavior and capability thresholds rather than a single anecdotal comparison.

## Headline results

- A self-organizing "Sequential" protocol **outperforms centralized (hierarchical) coordination by 14%** (p < 0.001) — a statistically robust effect, not a marginal one.
- Across the 8 protocols tested, there is a **44% quality spread** between best and worst (Cohen's d = 1.86, p < 0.0001), indicating that *which* coordination protocol is chosen matters enormously — protocol choice is not a minor implementation detail.
- Agents in self-organizing conditions **spontaneously developed specialized roles and internal hierarchies without any pre-assignment** — and, notably, agents "voluntarily abstain from tasks outside their competence," i.e. functional role differentiation emerged bottom-up rather than needing to be designed top-down.
- The self-organizing system scaled **sub-linearly up to 256 agents without quality degradation**, and in the process generated **5,006 unique emergent roles from just 8 starting agents** — meaning role identity itself became fluid and highly differentiated far beyond what a human designer would typically hand-author.
- Open-source models running self-organizing protocols achieved **95% of closed-source quality at 24x lower cost**, suggesting the self-organization approach is also more accessible/cheaper to realize than hierarchies that may depend on a single very capable "manager" model.

## The critical caveat: capability threshold

The paper does not claim self-organization is universally superior. It explicitly identifies a **capability threshold**: models below that threshold **still benefit from rigid, pre-assigned structure** — i.e., fixed roles function as scaffolding that compensates for weaker underlying reasoning/instruction-following, while sufficiently capable models are better served by being allowed to organize themselves. This is the paper's central design recommendation, stated directly: **"Give agents a mission, a protocol, and a capable model — not a pre-assigned role."**

## Relevance to the fixed-vs-dynamic-roles question

This is one of the most direct head-to-head experimental treatments of the wiki's target hypothesis, and its evidence cuts *against* the "static roles are better" hypothesis for capable models — while simultaneously offering an important qualifier that could rescue a narrower version of the hypothesis (fixed roles as compensation for weak models, not as a universal best practice). The emergent-role findings (5,006 roles from 8 agents) also complicate what "a role" even means as a unit of analysis: if capable agents fluidly generate and shed thousands of role-like behavioral clusters at negligible cost, treating "role" as a fixed, nameable, permanently-assigned slot may be the wrong abstraction for high-capability regimes, even if it remains a useful one for weaker models or tightly regulated production pipelines.
