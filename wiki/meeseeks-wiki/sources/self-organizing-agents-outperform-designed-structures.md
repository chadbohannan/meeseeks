# Drop the Hierarchy and Roles: How Self-Organizing LLM Agents Outperform Designed Structures

Source: https://arxiv.org/html/2603.28990
Accessed: 2026-07-27

Framing: the largest-scale controlled study found in this search — 25,000+ task runs across 8 models and 4 coordination protocols — and it delivers a genuinely two-sided answer: self-organizing/autonomous role assignment beats designed, centrally-assigned structure for capable models, but the advantage **inverts** below a model-capability threshold, where fixed, exogenously assigned roles win instead.

## Protocols compared

Four coordination architectures were systematically varied, forming a spectrum from fully centralized/static to fully autonomous/dynamic:

1. **Coordinator (centralized)** — one agent assigns roles and phases to the rest; costs N+1 LLM calls. This is the closest analogue to a static, explicitly-role-assigned system.
2. **Sequential (hybrid)** — agent *ordering* is fixed, but each agent autonomously selects its own role/contribution within that slot; N calls.
3. **Broadcast (signal-based)** — two rounds: agents simultaneously declare intentions, then simultaneously decide, without central assignment; 2N calls.
4. **Shared (fully autonomous)** — agents make fully parallel, independent decisions coordinated only through shared memory, with no fixed order or central role assignment; N calls.

## Headline results

- **Sequential vs. Shared**: Sequential wins by **+44%** quality (Cohen's d = 1.86, p < 0.0001) — i.e., pure unstructured autonomy is *not* the best-performing dynamic condition; some fixed scaffolding (ordering) still helps even in the most autonomous designs.
- **Sequential vs. Coordinator (centralized/static)**: Sequential wins by **+14%** quality across the three strongest models tested (p < 0.001).
- Sequential reached a quality ceiling of **0.875** on the hardest single-domain complexity tier (L3) with N=16 agents using Claude Sonnet 4.6.

This establishes the paper's core claim — the "endogeneity paradox": the best-performing design is neither maximal top-down control nor maximal unstructured autonomy, but a **hybrid** that fixes minimal structure (agent ordering) while leaving role content and specialization to emerge endogenously.

## Capability-threshold reversal — the honest counter-finding

Crucially for a fair read of "dynamic beats static," this reversal is model-dependent, not universal:
- **Strong models (Claude)**: autonomous/self-organizing protocols outperform fixed, designed structures.
- **Weak models (GLM-5)**: the relationship flips — rigid, externally-imposed structure is *necessary*, and free-form self-organization **decreased quality by 9.6%** relative to structured baselines.

The authors attribute this threshold to three capabilities a model needs before self-organization pays off: self-reflection (measured via abstention rates — knowing when *not* to act), deep reasoning, and precise instruction-following. Below that bar, dynamic role emergence produces worse outcomes than simply telling agents what to do.

## Scale and emergent properties

- Experiment scope: 25,000+ task runs, 20,810 configurations, 8 models (Claude Sonnet, GPT-5.4, DeepSeek v3.2, GLM-5, etc.), 4–256 agents per system, 4 complexity tiers (L1 single-domain through L4 adversarial multi-stakeholder).
- Quality remained statistically stable scaling from 64 to 256 agents (p = 0.61), with only an 11.8% cost increase across an 8x agent-count expansion — dynamic/self-organizing coordination did not collapse under scale in this study.
- **Role Specialization Index (RSI) → 0**: agents produced highly differentiated, non-redundant roles at scale — 5,006 unique roles observed from just 8 agents across runs, and 91% of roles were unique at N=64, indicating genuine emergent specialization rather than agents converging on the same behavior.
- **Voluntary abstention**: 8.6% of Sequential-protocol agents endogenously chose not to act on a given turn, versus 100% directed exclusion under Coordinator (i.e., under the static/centralized protocol, non-participation is only ever imposed, never chosen).
- **Spontaneous hierarchy**: hierarchy depth increased from 1.0 to 2.0 as team size scaled, but stayed shallow — self-organizing systems still favor flat structures over deep chains of command.
- Quality dropped 37.7% from the easiest (L1, 0.986) to hardest (L4, 0.614) complexity tier, showing dynamic coordination's advantage narrows (but per the headline numbers, does not disappear) as task difficulty rises.
- Protocol choice explained **44%** of quality variation among strong models; model choice explained **~14%** — implying coordination design (dynamic vs. static) may matter more than which underlying LLM is used, at least among capable models.

## Limitations acknowledged by the authors

1. All evaluation used LLM-as-judge (GPT models), not human raters, introducing potential judge bias.
2. The judge model changed between experiment series (GPT-4o for Series 1–2, GPT-5.4 for Series 3), which the authors say compromises cross-series comparability.
3. Tasks were synthetic, not validated against established benchmarks or real-world workflows.
4. Sequential protocol's O(N) execution time becomes a latency problem at extreme scale.
5. Statistical testing did not consistently correct for multiple comparisons, though the authors state primary findings survive Bonferroni correction.

This paper is the strongest single piece of evidence gathered in this pass for the claim that dynamic/self-organizing role allocation *can* substantially outperform fixed roles — but it is equally strong, explicitly-stated evidence that this advantage is conditional on model capability, and reverses for weaker models.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/html/2603.28990 |
