# Emergent Coordination and Phase Structure in Independent Multi-Agent Reinforcement Learning

Source: https://arxiv.org/abs/2511.23315
Accessed: 2026-07-27

A 2025/2026 theoretical/empirical paper that treats the emergence, fragility, and collapse of coordination in decentralized multi-agent RL as a physics-style phase-transition phenomenon — the most conceptually rigorous account in this source set of *why* decentralized coordination sometimes emerges and sometimes doesn't.

## Central question

The paper investigates when coordination emerges, fluctuates, or collapses in decentralized multi-agent reinforcement learning, using **fully Independent Q-Learning (IQL)** — agents that learn purely from their own local reward signal with no shared training infrastructure, no communication, and no awareness that other learning agents even exist — as a minimal, deliberately stripped-down testbed. The choice of IQL is significant: it isolates the phenomenon of interest (does coordination emerge from decentralized learning alone?) from confounds like explicit communication channels or centralized training.

## Theoretical framework: "kernel drift"

The paper's key theoretical construct is **kernel drift**: from any one agent's point of view, the effective transition kernel of its environment (i.e., "if I take this action in this state, what happens next") is not actually stationary, because other agents are simultaneously updating their own policies. Every other agent's policy update silently reshapes what "the environment" looks like from any given agent's perspective. This reframes MARL non-stationarity (a challenge already flagged in general terms by the broader MARL survey in this source set) as a concrete, measurable drift process that can be tracked and that competes against synchronization forces that pull agents toward mutual coordination.

The authors treat coordination itself as a distribution/interaction-driven phase phenomenon, explicitly analogized to physical phase transitions (e.g., in statistical mechanics), where a system can sit in qualitatively different macroscopic regimes depending on control parameters.

## Methodology

Large-scale experimental sweeps varied two control parameters:
- **Environment size (L)**
- **Agent density (ρ)** — the number of agents relative to the environment's size/capacity

For each (L, ρ) combination, the researchers built "phase maps" using two measured metrics:
- **Cooperative success rate (CSR)** — how often agents successfully achieve joint/cooperative outcomes.
- **A stability index** derived from the variance of the temporal-difference (TD) learning error — high TD-error variance indicates unstable, still-fluctuating value estimates, a proxy for how "settled" the learning dynamics are.

They additionally ran synchronization analyses examining how tightly agents' actions need to be temporally aligned for cooperation to be sustained.

## Three phase regimes identified

1. **Coordinated and stable phase** — agents reliably achieve cooperation, with low variance in outcomes; synchronization forces dominate over kernel drift.
2. **Fragile transition region** — coordination is unstable; the competition between kernel drift (destabilizing) and synchronization (stabilizing) produces high volatility, with outcomes sensitive to small perturbations.
3. **Jammed / disordered phase** — cooperation collapses entirely into disorder or deadlock; kernel drift dominates and no stable coordinated equilibrium is sustained.

## Key findings

- A **"double Instability Ridge"** — a sharp boundary structure in (L, ρ) parameter space — separates the three regimes, echoing the sharp boundaries seen at physical phase transitions.
- **Removing agent identifiers eliminates kernel drift entirely**, and with it, the entire three-phase structure collapses — i.e., when agents can no longer distinguish themselves from one another (or be distinguished by the environment/each other), the specific instability mechanism the paper identifies disappears. This is presented as evidence that *inter-agent asymmetry* (agents being individually identifiable/distinguishable) is the actual driver of the complex phase structure, not multi-agency per se.
- Temporal alignment between agents' actions is necessary for sustained cooperation — desynchronized timing pushes systems toward the fragile or jammed regimes even at otherwise favorable density/size settings.
- Small inter-agent asymmetries are identified as the essential driver of emergent complexity in these systems — perfect symmetry among agents removes the phenomenon being studied.

## Implications

The paper argues emergent coordination in decentralized MARL is not a binary (coordinates / doesn't coordinate) outcome but a coherent phase structure governed by measurable control parameters — scale (L), density (ρ), and the kernel-drift/synchronization competition — giving a theoretical grounding for predicting, rather than just empirically observing, when decentralized multi-agent learning systems will cooperate, teeter, or fail.

## Relevance to LLM-swarm research

Although framed in classical tabular-RL terms (IQL, TD-error), this paper's core claims are directly portable to the LLM-swarm literature in this source set: SwarmBench's finding that LLM swarms "struggle with adaptive strategy formation under uncertainty" and CodeCRDT's finding that parallel coordination benefits collapse above a certain agent count (~20) are both consistent with this paper's picture of coordination as something that holds only within a bounded regime of scale/density/synchronization, outside of which systems drift into fragile or jammed states. A natural open question this raises for LLM-based swarms specifically: what plays the role of "kernel drift" when the "policy" being updated each round is not a value function but a stream of natural-language reasoning conditioned on other agents' outputs?

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2511.23315 |
