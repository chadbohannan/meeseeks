# DyLAN: Dynamic LLM-Powered Agent Network for Task-Oriented Agent Collaboration

Source: https://arxiv.org/abs/2310.02170 (COLM 2024; code: https://github.com/SALT-NLP/DyLAN)
Accessed: 2026-07-27

Framing: DyLAN is a direct engineering argument for dynamic-over-static teams — it explicitly targets the weakness of "fixed number of agents and static communication structures" and reports double-digit accuracy gains from letting team composition be selected and pruned at inference time.

## Problem framing

The authors motivate DyLAN by naming the static-role baseline problem directly: prior LLM multi-agent approaches are "constrained by using a fixed number of agents and static communication structures," which prevents adapting the team to what a specific task or domain actually needs. DyLAN's proposed fix is to automatically select a team of agents from a pool of candidates and let them collaborate over a dynamic (not fixed) communication structure.

## Mechanism: two-stage paradigm

1. **Team Optimization** — before task solving, DyLAN runs an agent-selection procedure driven by an unsupervised metric the authors call the **Agent Importance Score**, which estimates how much each candidate agent contributes to correct outcomes based on preliminary interaction. Low-contribution agents are pruned from the team.
2. **Task Solving** — the optimized subset of agents then collaborates on the actual query, interacting over multiple rounds in a dynamic architecture that supports **inference-time agent selection** (which agents participate in a given round can change) and an **early-stopping mechanism** that halts collaboration once the team reaches consensus or a stable answer, controlling cost.

This is a stronger form of "dynamic roles" than AgentVerse's recruiter: DyLAN doesn't just describe roles at runtime, it decides *membership itself* — who's on the team at all — based on a measured, per-agent performance signal, and can change who participates round to round.

## Quantitative results

- DyLAN reports a **13.0%** improvement on MATH and a **13.3%** improvement on HumanEval, both relative to a single execution on GPT-3.5-turbo (i.e., vs. no multi-agent collaboration at all).
- On specific MMLU subjects, the team-optimization step (the dynamic membership-selection stage specifically) **increases accuracy by up to 25.0%** over not optimizing the team — this is the clearest dynamic-vs-static-style internal ablation in the paper, since it isolates the value of the *optimization/selection* mechanism from collaboration in general.
- An ablation on optimized team size shows DyLAN with an optimized 3-agent team **outperforms both DyLAN before team optimization and a 4-agent LLM Debate baseline**, i.e., a smaller, dynamically-curated team beat a larger, undifferentiated team — evidence that selective dynamic membership, not just raw agent count, is doing the work.
- The paper positions its overall result as outperforming "strong baselines in code generation, decision-making, general reasoning, and arithmetic reasoning tasks with moderate computational cost," explicitly tying the dynamic-selection mechanism to a favorable cost/accuracy tradeoff rather than claiming it's free.

## Caveats

The full PDF's methodology section (exact per-benchmark accuracy tables beyond the headline deltas above, and any explicit failure cases) could not be extracted cleanly from the available rendering — the source PDF's text stream did not parse into readable markdown via automated fetch, and only the abstract/overview and the widely-cited headline numbers above could be reliably confirmed via secondary summarization (Hugging Face paper page, OpenReview listing). This source should be treated as strong but partially secondhand for granular numbers; the top-line 13.0%/13.3%/25.0% figures and the "optimized 3-agent team beats 4-agent Debate" ablation are corroborated across multiple independent summaries (arXiv abstract, Hugging Face, OpenReview), which increases confidence in them despite the primary-PDF extraction failure.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2310.02170 |
| 2026-07-27 | https://huggingface.co/papers/2310.02170 |
