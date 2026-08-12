# LATTE: Improving the Efficiency of Language Agent Teams with Adaptive Task Graphs

Source: https://arxiv.org/html/2605.06320
Accessed: 2026-07-27

Framing: this is the most directly controlled comparison found in this search — same team size, same base models, five coordination structures (including a fixed-role baseline and a static-graph ablation of the authors' own system) run head-to-head on identical tasks — and every metric (accuracy, cost, wall-clock time, conflict rate) favors the dynamic, runtime-mutable coordination structure over the static alternatives.

## Mechanism: shared, evolving coordination graph

LATTE coordinates a team (one Lead agent + four Worker agents) through a shared coordination graph `Gt` that the team collectively builds and modifies *during* execution, rather than a plan fixed up front. The graph's nodes are subtasks, edges are dependencies, and labels track which agent owns each task and its status (pending / assigned / in_progress / done / verified). The "frontier" is the set of tasks currently unblocked and ready for parallel execution.

Seven mutation operators let the graph change at runtime:
- **Discover** — Workers or the Lead propose new subtasks with dependencies as the task's true shape becomes clearer.
- **Assign** — Lead assigns a pending task to a specific worker.
- **Claim** — Workers self-assign available frontier tasks (a work-stealing pattern — this is role/task allocation happening bottom-up, not just top-down).
- **Complete** — Workers mark tasks finished.
- **Release** — Lead reassigns stalled tasks back to pending (recovering from a worker that's stuck).
- **Close** — Lead force-completes a task without worker confirmation.
- **Verify** — Lead spawns dedicated verification subtasks for quality control.

The design deliberately splits authority: Workers propose local changes from limited context, while the Lead evaluates proposals with global visibility — balancing centralized consistency against decentralized adaptability, rather than picking one extreme.

## Comparison baselines (the controlled part)

Five team structures were evaluated on identical tasks, holding team size fixed at N=5 and testing across two base models (Claude Sonnet 4-6, GPT-5.2) — 10 trials × 5 structures × 2 models × 3 tasks = 300 trials total:

1. **LATTE** — full dynamic/adaptive graph.
2. **MetaGPT** — fixed functional roles (Product Manager, Architect, Engineer, QA), the clearest static-role baseline in the comparison.
3. **Leader-Worker hierarchy** — one fixed Lead statically assigning tasks to four Workers, no graph adaptation.
4. **Decentralized** — five peer agents, no central coordinator, no shared graph.
5. **Static graph ablation** — LATTE's own architecture, except the Lead initializes the task graph once and it cannot adapt after planning. This is the cleanest isolation of "dynamic adaptation" as the sole variable, since everything else about the system is identical to full LATTE.

## Quantitative results

**Task accuracy** (overall):
- LATTE: **79.7%**
- Leader-Worker: 70.1% (p = 0.04)
- Decentralized: 73.9% (p = 0.16, not significant)
- Static graph ablation: **57.6%** (p < 0.01) — a 22.1-point gap attributable specifically to the ability to adapt the graph after initial planning, since this condition is otherwise architecturally identical to LATTE.
- MetaGPT (fixed roles): **33.9%** (p < 0.01) — the worst performer by a wide margin.

**Token efficiency** (normalized cost, LATTE = 47.5% baseline):
- Static graphs: 86.9% (p < 0.01)
- Leader-Worker: 104.2% (p < 0.01)
- Decentralized: 120.9% (p < 0.01)
- MetaGPT: 228.7% (p < 0.01) — fixed roles cost nearly 5x LATTE's tokens for a worse result.

**Wall-clock time** (normalized, LATTE = 66.7%, fastest):
- Decentralized: 69.3% (not significant)
- Static graphs: 110.7% (p < 0.01)
- Leader-Worker: 105.7% (p < 0.01)
- MetaGPT: 289.0% (p < 0.01)

**Per-task accuracy/cost/time** (Table 2, LATTE only): Data Analysis 96±1% (122K tokens, 3.2±0.3 min); Debugging 100±0% (227K tokens, 5.3±0.6 min); Library Extension 40±2% (98K tokens, 2.1±0.2 min) — the weakest task for LATTE is still evaluated relative to the same baselines above, where it still leads.

**Coordination-quality metrics** — dynamic coordination also reduced wasted work, not just improved end results:
- File overwrite conflicts per trial: 4.3x (LATTE) vs. 22.8x (Leader-Worker) vs. 35.4x (Decentralized).
- Concurrent write conflicts: 1.0x vs. 8.5x vs. 11.5x.
- Wasted output characters: 5,236 vs. 45,436 vs. 78,062.
- Messages per task: 20.4 (LATTE) vs. 31.4 (Leader-Worker) vs. 34.8 (Decentralized).
- Agent activation rate: LATTE activated agents in only 48.7% of rounds (idle agents don't burn compute) vs. 80% (Leader-Worker) and 100% (Decentralized, since peers always participate).
- Straggler mitigation: median task completion 39.2s (LATTE) vs. 75.6s (static); 95th-percentile tail 130s vs. 294s (2.3x reduction).

## Benchmarks

Three collaborative domains: Exploratory Data Analysis (preprocessing/analysis/visualization on opaque datasets, graded via private test suite for planted properties), Debugging (iterative test-and-fix on a signal-processing library with embedded bugs, graded on full test-suite pass), and Library Extension (completing stub classes/modules in a Python text-processing library, graded via private test suite).

## Limitations acknowledged by authors

1. Planning overhead for the initial graph may exceed its benefit on short/simple tasks better suited to a single agent.
2. The seven operators are designed for structured domains with natural subtask boundaries; less suited to open-ended reasoning tasks.
3. Team size was held fixed at N=5 throughout; behavior at larger scales is unexplored.
4. Emergent selective verification (the Verify operator) works empirically but "lacks theoretical grounding" — the authors flag this as an opportunity for future fine-tuning/RL work.
5. Whether teams can learn better task decompositions through iterative experience (bridging toward something like Meta-Team's longitudinal evolution) is left to future work.

The authors' own framing: explicit, agent-maintained, runtime-mutable coordination structures are "more efficient, interpretable, and adaptive" than either predetermined hierarchies (MetaGPT, Leader-Worker) or unstructured approaches (Decentralized) — directly supporting dynamic role/task allocation over static role assignment in this controlled setting.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/html/2605.06320 |
