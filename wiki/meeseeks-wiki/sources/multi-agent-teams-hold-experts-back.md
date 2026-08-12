# Multi-Agent Teams Hold Experts Back

Source: https://arxiv.org/abs/2602.01011 (PDF: https://arxiv.org/pdf/2602.01011)
Accessed: 2026-07-27

A study of **unconstrained, self-organizing** LLM teams (no fixed roles, workflows, or aggregation rules) that finds they systematically fail to leverage their own best member's expertise — evidence that pure self-organization has a real, measurable failure mode, which bears on the fixed-vs-dynamic-roles question from the opposite direction of most "self-organization wins" papers.

## Setup and framing

Authors: Aneesh Pappu, Batu El, Hancheng Cao, Carmelo di Nolfo, Yanchao Sun, Meng Cao, James Zou.

The paper's framing is explicit about the design space: "most prior work enforces coordination through fixed roles, workflows, or aggregation rules, leaving open the question of how well self-organizing teams perform when coordination is unconstrained." The authors deliberately study the *unconstrained* end of the spectrum — agents interacting freely, without predetermined roles or pipelines — and ask whether that freedom is actually good for outcomes. They draw explicitly on organizational psychology's concept of team "synergy": a well-functioning team should match or exceed its single best individual member's performance (in human teams, this is often observed; a good team doesn't just average its members, it channels expertise appropriately).

## Central finding: LLM teams fail to leverage their own experts

Across a mix of human-inspired and frontier ML benchmarks, self-organizing LLM teams **consistently fail to match their own best (expert) agent's solo performance — even when the team is explicitly told which agent is the expert.** The performance loss reaches **up to 41.1% on ML benchmarks** relative to what the expert alone would have achieved. This is a striking result: it isn't that the team can't *identify* who the expert is (that information was given), it's that the team process itself degrades the expert's contribution once other agents are in the loop.

## Root cause: expert leveraging, not expert identification

Decomposing the failure, the authors show the bottleneck is **leveraging expertise, not identifying it**. Conversational analysis reveals a mechanism: LLM teams exhibit a tendency toward **"integrative compromise"** — averaging together the expert's and non-experts' views rather than appropriately up-weighting the expert's input. This averaging tendency:
- **Increases with team size** (bigger self-organizing teams compromise more, diluting the expert's voice further).
- **Correlates negatively with performance** (the more compromise-seeking the conversation, the worse the outcome).

## A trade-off, not a pure failure

Interestingly, the same consensus-seeking, compromise-prone behavior that hurts expert-leveraging **improves robustness to adversarial agents** — a team that instinctively averages viewpoints is harder for one bad-faith or malfunctioning agent to hijack. The authors frame this as a genuine trade-off between alignment/robustness and effective expertise utilization, not simply a bug to be engineered away.

## Relevance to the fixed-vs-dynamic-roles question

This paper is a useful counterweight to purely pro-self-organization findings (e.g., "Drop the Hierarchy and Roles," also gathered in this source set): it shows that *unconstrained* coordination has its own systematic failure mode — an inability to appropriately weight expertise — that isn't about role ambiguity in the MAST sense (agents don't violate a role spec, because there is no spec to violate) but is nonetheless a structural consequence of flat, roleless interaction. Read alongside the "quantitative role clarity" and AgentGroupChat-V2 sources in this set, it suggests a plausible synthesis: some form of structure — even if not necessarily a permanently fixed, named role — may be needed specifically to prevent regression-to-the-mean compromise and ensure the most-capable agent's output actually drives the team's answer, rather than getting diluted by committee.
