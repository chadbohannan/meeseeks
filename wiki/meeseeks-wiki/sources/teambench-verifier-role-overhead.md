# TeamBench: A Multi-Agent Teamwork Benchmark with OS-Enforced Role Separation

Source: https://teambench.github.io/
Accessed: 2026-07-27

A five-condition ablation benchmark (851 software-engineering, data-engineering, and incident-response tasks) that isolates the marginal contribution of each fixed role (Planner, Executor, Verifier) in a static three-role pipeline — included here despite cutting against parts of the hypothesis, because it shows that adding a fixed role does not automatically help, and in one case actively hurts, which is important honest counter-evidence to weigh against the supporting sources.

## What is being compared

TeamBench runs agent roles in OS-isolated containers so that each role's actual contribution can be measured independently rather than inferred, and defines a "Teamwork Necessity Index" (TNI) to quantify whether a team is adding value over a single capable agent. Five conditions are tested:

1. **Oracle** — a single unrestricted agent with full access to the task specification, workspace, and tools (the ceiling/reference condition).
2. **Restricted** — a single agent without access to the complete specification (the floor/reference condition).
3. **No Plan** — the fixed three-role team with the Planner role removed.
4. **No Verify** — the fixed three-role team with the Verifier role removed.
5. **Full Team** — the complete, fixed three-role pipeline: Planner, Executor, Verifier.

TNI is computed as `(S_team − S_restricted) / max(ε, S_oracle − S_restricted)`, where 1.0 means the team fully recovers oracle-level performance and above 1.0 means the team exceeds even the unrestricted single-agent oracle.

## Key result: the Verifier role adds overhead, not correctness

"No-Verify and Full Team tie on average (0.592), with No-Verify outperforming Full Team on most individual tasks — indicating the Verifier role adds overhead rather than correctness." The benchmark further reports that LLM-based Verifiers falsely approve 49.4% of submissions that actually fail deterministic grading checks — the Verifier role, despite being fixed and explicitly defined for the whole task, is unreliable enough that removing it entirely performs statistically the same as, or better than, keeping it on a per-task basis.

The paper's stated conclusion is that "the Verifier is the binding constraint, not the Planner" — i.e., among the fixed roles tested, one (Planner) appears to pull its weight while the other (Verifier) does not, and a blanket claim that "more fixed roles = better" does not hold here.

## Relevance to the static-vs-dynamic-roles hypothesis

This source does not test static vs. dynamic role *assignment* — all conditions use fixed, pre-defined roles — so it is not a direct test of the wiki's hypothesis. It is included because it is directly relevant to a component of that hypothesis often taken for granted: that adding a permanently-defined role to a team is presumptively beneficial. TeamBench shows this is task- and role-dependent — a poorly-calibrated fixed role (here, an LLM Verifier prone to false approvals) can introduce coordination overhead that cancels out or exceeds its benefit, even though its responsibilities are clearly and permanently specified. This should temper any blanket reading of the MetaGPT or AgentGroupChat-V2 results (see the companion source pages) as "static roles always help" — the benefit appears to depend heavily on whether the specific role being added is actually well-suited to the task, not merely on whether a role boundary exists.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://teambench.github.io/ |
