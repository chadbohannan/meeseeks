# SwarmBench: Benchmarking LLMs' Swarm Intelligence

Source: https://arxiv.org/abs/2505.04364
Accessed: 2026-07-27

A 2025 benchmark paper that stress-tests LLMs specifically as decentralized swarm agents operating under partial observability and local-only communication — the most direct empirical measurement in this source set of whether current LLMs actually exhibit swarm-intelligence-style coordination.

## Purpose and framing

The benchmark targets a gap the authors identify in prior multi-agent LLM evaluation: most existing benchmarks give agents either full information about the environment or rely on a central controller, which sidesteps "the unique challenges of decentralized coordination when agents operate with incomplete spatio-temporal information" — i.e., real swarm conditions, where each agent sees only its local neighborhood and must act on incomplete, changing information.

## Environment and task design

SwarmBench runs in a configurable 2D grid environment and defines five foundational coordination tasks drawn from classic swarm-robotics/collective-behavior literature:

1. **Pursuit** — agents must track and close in on one or more moving targets.
2. **Synchronization** — agents must align their timing/actions with each other without central timing signal.
3. **Foraging** — agents must collectively locate and gather distributed resources.
4. **Flocking** — agents must produce coordinated group movement (analogous to bird flocking / Reynolds boids-style behavior).
5. **Transport** — agents must cooperatively move an object too large or heavy for a single agent, requiring joint physical coordination.

Critically, agents receive only local sensory input via a k×k view window (not global state) and can only communicate locally with nearby agents — mirroring the informational constraints that define genuine swarm systems (as opposed to systems with a shared global blackboard or central planner).

## Methodology

Evaluation is zero-shot: leading LLMs are dropped into these environments without any task-specific fine-tuning or few-shot demonstration, and their coordination effectiveness and emergent group dynamics are measured directly from behavior in the configurable simulation. Models tested include DeepSeek-v3 and o4-mini among other leading LLMs (the fetched excerpt did not enumerate the complete model list).

## Key findings

Performance varies significantly by task — some scenarios showed at least minimal emergent coordination, but the dominant finding is a struggle: current LLMs "significantly struggle with robust long-range planning and adaptive strategy formation under the uncertainty inherent in these decentralized scenarios." In other words, when stripped of global state and centralized control — the actual defining conditions of swarm intelligence — LLM agents' coordination ability degrades substantially compared to their performance in benchmarks that permit fuller information sharing.

## Conclusions and contribution

The authors argue that evaluating LLMs specifically under swarm-like informational constraints (local view, local communication, no central controller) is essential to understanding whether LLM-based multi-agent systems can function as genuine decentralized intelligent systems, as opposed to systems whose apparent coordination is really just riding on hidden global information sharing. SwarmBench is released as an open toolkit intended to make this kind of evaluation reproducible for future research.

## Relation to other sources in this set

SwarmBench's negative/cautionary finding (LLMs struggle under true decentralization) is a useful counterweight to more architecture-optimistic papers like AgentNet and CodeCRDT in this source set — it suggests that even when a good decentralized *coordination substrate* exists, the LLM agents' own reasoning may still be the bottleneck for swarm-style tasks requiring long-range planning under partial observability.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2505.04364 |
