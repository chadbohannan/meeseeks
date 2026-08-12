# MetaGPT: Ablation Study on Role Specialization (Table 3) and Baseline Comparison (Table 1)

Source: https://arxiv.org/abs/2308.00352 (paper; HTML: https://arxiv.org/html/2308.00352v6)
Accessed: 2026-07-27

This is the controlled-ablation portion of the MetaGPT paper — progressively adding fixed, permanently-defined roles (Engineer → +Product Manager → +Architect → +Project Manager) to a software-generation pipeline and measuring output quality — and it shows a monotonic-ish improvement in code executability and a monotonic drop in required human revisions as more distinct roles are added, directly supporting the hypothesis that static, explicitly-defined role composition improves multi-agent task success versus a role-free (single generalist agent) baseline.

## What is being compared

MetaGPT simulates a software company with five potential roles — Product Manager, Architect, Project Manager, Engineer, QA Engineer — each with a fixed, non-negotiable responsibility for the entire task, communicating through structured document artifacts (the paper's "Standardized Operating Procedures," SOPs) rather than free-form chat. The ablation in Table 3 starts from a single generalist "Engineer only" configuration (functionally a role-free, single-agent baseline that both writes and is solely responsible for the whole task) and adds one fixed role at a time, always keeping earlier roles active, to isolate the marginal contribution of each new permanently-assigned role.

## Table 3 — Role ablation, exact numbers

| Configuration | #Agents | Total code lines | Cost ($) | Human revisions (rounds) | Executability (0–4 scale) |
|---|---|---|---|---|---|
| Engineer only | 1 | 83.0 | 0.915 | 10 | 1.0 |
| + Product Manager | 2 | 112.0 | 1.059 | 6.5 | 2.0 |
| + Architect | 3 | 143.0 | 1.204 | 4.0 | 2.5 |
| + Project Manager | 3 | 205.0 | 1.251 | 3.5 | 2.0 |
| All roles | 4 | 191.0 | 1.385 | 2.5 | 4.0 |

The paper's stated conclusion: "The addition of roles different from just the Engineer consistently improves both revisions and executability." Going from the single-generalist-agent baseline (Engineer only: executability 1.0, 10 human revision rounds needed) to the full fixed four-role team (executability 4.0 — perfect — and only 2.5 revision rounds) is roughly a 4x improvement in executability and a 75% reduction in required human intervention, at a marginal cost increase of about 51% ($0.915 → $1.385). Note the "+Project Manager" row is not strictly monotonic on executability (drops from 2.5 to 2.0 versus the "+Architect" row before recovering to 4.0 once all roles are present) — the paper does not explain this dip, so it should be read as a real but non-smooth trend rather than a perfectly linear one.

## Table 1 — SoftwareDev benchmark comparison against a role-differentiated competitor and an ablated self-baseline

| Metric | ChatDev (comparison framework) | MetaGPT w/o executable feedback | MetaGPT (full) |
|---|---|---|---|
| Executability (0–4) | 2.25 | 3.67 | 3.75 |
| Runtime (seconds) | 762 | 503 | 541 |
| Token usage | 19,292 | 24,613 | 31,255 |
| Total code lines | 77.5 | 194.6 | 251.4 |
| Tokens per line | 248.9 | 126.5 | 124.3 |
| Human revision cost (rounds) | 2.5 | 2.25 | 0.83 |

MetaGPT's fixed four-role pipeline outperforms ChatDev — itself a role-based but differently-structured competitor (see the separate ChatDev source page) — on almost every metric, most notably needing under a third of the human revision rounds (0.83 vs 2.5) while producing over 3x the code volume per task.

## Baseline comparison against a role-free agent (AutoGPT)

Secondary reporting on the same paper (used to corroborate, not as primary source) notes MetaGPT was also benchmarked against AutoGPT — a single, general-purpose autonomous agent with no fixed role decomposition — on the same software-generation setting, and AutoGPT scored only 1.0 on executability and "failed to generate executable code" in the comparison, versus MetaGPT's 3.75–4.0. This is consistent with the internal "Engineer only" ablation row above (also executability 1.0), suggesting the single-generalist-agent floor is a fairly stable ~1.0 executability score in this benchmark regardless of whether the generalist is MetaGPT's own Engineer role or a separate role-free framework like AutoGPT.

## Headline pretrained-benchmark numbers (context, not ablation)

MetaGPT also reports Pass@1 scores of 85.9% (HumanEval) and 87.7% (MBPP), which the paper characterizes as state-of-the-art at time of publication for these code-generation benchmarks, and reports a "100% task completion rate" across its evaluated software-engineering task set — offered here as headline context for the framework's overall competitiveness, not as ablation evidence.

## Relevance to the static-vs-dynamic-roles hypothesis

This is one of the cleaner controlled comparisons available for the hypothesis: the roles being added (Product Manager, Architect, Project Manager) are fixed for the entire task before execution begins — they are not negotiated, reassigned, or discovered at runtime — and each addition to the fixed role set produces a measurable, mostly-monotonic improvement over the role-free single-agent baseline. The ablation does not, however, test the *opposite* manipulation that would isolate "fixed" from "role-based" as separate variables — e.g., shuffling which agent holds which role mid-task, or comparing against a dynamically-reassigned-role condition with the same total agent count. All roles here are fixed by construction, so the study is best read as "distinct fixed roles beat no roles / one generalist role," not as "fixed roles beat dynamically-reassigned roles."

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2308.00352 |
| 2026-07-27 | https://arxiv.org/html/2308.00352v6 |
