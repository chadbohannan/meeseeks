# Unleashing the Emergent Cognitive Synergy in Large Language Models: A Task-Solving Agent through Multi-Persona Self-Collaboration (Solo Performance Prompting / SPP)

Source: https://arxiv.org/abs/2307.05300 (HTML: https://ar5iv.labs.arxiv.org/html/2307.05300; ACL: https://aclanthology.org/2024.naacl-long.15/)
Accessed: 2026-07-27

A controlled ablation directly comparing dynamically-determined, task-specific personas against fixed, generic personas within the same multi-persona-collaboration framework, and it finds dynamic personas win by a wide margin — this is evidence that cuts against the "static/fixed roles are better" hypothesis and is captured here in full because the wiki maintainer asked for honest reporting even when a source contradicts the hypothesis.

## What Solo Performance Prompting is

SPP has a single LLM simulate multiple distinct personas in a multi-turn self-collaboration rather than using separate agent instances, but the persona-identification mechanism it studies is directly relevant to any claim about role definition (fixed vs. dynamic), since the paper explicitly ablates that mechanism. The core procedure: (1) identify multiple participants with specialized personas needed for the task, including a leader "AI Assistant" persona, (2) have participants contribute knowledge/suggestions from their persona's expertise, (3) have the leader persona draft, solicit feedback from the other personas, and iteratively revise.

## Main results (Table 2) — SPP vs. non-persona baselines

| Task | Standard prompting | Chain-of-Thought | Self-Refine | SPP |
|---|---|---|---|---|
| Trivia Creative Writing (N=5) | 74.6% | 67.1% | 73.9% | 79.9% |
| Trivia Creative Writing (N=10) | 77.0% | 68.5% | 76.9% | 84.7% |
| Codenames Collaborative | 75.4% | 72.7% | 64.6% | 79.0% |
| Logic Grid Puzzle | 57.7% | 65.8% | 60.0% | 68.3% |

SPP (persona-based) beats all three non-persona baselines (Standard prompting, Chain-of-Thought, Self-Refine) on every task, with the largest gain on Logic Grid Puzzle (+18.5 points over Standard, +2.5 over CoT). This part of the paper is broadly supportive of "giving agents roles/personas beats not giving them any" — but the more targeted ablation below is about *how* those personas are determined.

## The directly relevant ablation: dynamic vs. fixed personas (Figure 7b)

The paper defines **SPP-Fixed-Persona**, a variant that constrains every run to two generic, task-invariant personas — "AI Assistant" and "Expert" — rather than letting the model dynamically identify fine-grained, task-specific personas at run time (e.g., "Historian," "Wordplay Enthusiast," or whatever the task calls for). This is the cleanest fixed-vs-dynamic role comparison found in this research pass, because both conditions use the same underlying framework and only the persona-determination mechanism differs.

| Task | SPP (dynamic personas) | SPP-Fixed-Persona (generic, static) |
|---|---|---|
| Trivia Creative Writing (N=5) | 79.9% | 72.9% |
| Trivia Creative Writing (N=10) | 84.7% | 75.9% |
| Codenames Collaborative | 79.0% | 38.1% |
| Logic Grid Puzzle | 68.3% | 64.3% |

The gap is large and consistent across every task, most dramatically on Codenames Collaborative (79.0% vs. 38.1% — more than double). The authors' stated conclusion: "SPP consistently outperforms SPP-Fixed-Persona across all tasks, suggesting that dynamic, fine-grained personas are more effective than fixed, general personas."

A second ablation (SPP-Profile, which adds detailed expertise descriptions to each dynamically-identified persona) showed only minimal further improvement over standard SPP, suggesting that once personas are task-specific and fine-grained, further elaborating their description adds little — the leverage is in specificity/dynamism of *which* persona is chosen, not in how verbosely it is described.

## Important caveat on what "fixed" means here

This ablation is not a perfect match for the wiki's hypothesis. The "fixed" condition in this paper (SPP-Fixed-Persona) is fixed *and generic* — every task gets the same two undifferentiated personas ("AI Assistant," "Expert") — which conflates two variables: (a) fixed-for-the-task-duration vs. dynamically-changing, and (b) generic/interchangeable vs. task-specialized. MetaGPT's and AgentGroupChat-V2's fixed roles (see companion source pages) are fixed *and* highly specialized (Product Manager, Architect, etc., or fine-grained cognitive sub-roles) — closer to what the hypothesis actually describes. SPP's experiment does not isolate "fixed-but-specialized" as its own condition, so it cannot cleanly distinguish "fixed roles hurt because they're fixed" from "fixed roles hurt because, in this specific ablation, they were also made generic." Read narrowly, it shows dynamic beats generic-fixed; it does not directly show dynamic beats specialized-fixed.

## Relevance to the static-vs-dynamic-roles hypothesis

Taken at face value, this is the clearest piece of evidence found in this research pass that argues against the hypothesis: within one controlled framework, letting the system choose task-specific personas at runtime substantially outperformed locking it to a fixed pair of roles. It should be weighed alongside the caveat above, and against the MetaGPT and AgentGroupChat-V2 results, which support fixed *specialized* roles over no/generic roles — the SPP result is best read as evidence that specificity of role definition matters at least as much as whether the role is fixed or dynamic, and that a fixed-but-generic role assignment can perform worse than a well-chosen dynamic one.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2307.05300 |
