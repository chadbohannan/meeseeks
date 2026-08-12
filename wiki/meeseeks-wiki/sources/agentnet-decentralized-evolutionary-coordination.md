# AgentNet: Decentralized Evolutionary Coordination for LLM-based Multi-Agent Systems

Source: https://arxiv.org/abs/2504.00587
Accessed: 2026-07-27

A 2025 paper proposing a fully decentralized, RAG-backed framework where LLM agents self-organize into a dynamically evolving directed acyclic graph (DAG) rather than being assigned to fixed roles by a central orchestrator — relevant as a concrete architecture for orchestrator-free agent-swarm scaling.

## Problem statement

The authors argue that traditional multi-agent LLM systems, which typically rely on a central orchestrator to route tasks and assign roles, suffer from several structural weaknesses: scalability bottlenecks (the orchestrator becomes a throughput ceiling), reduced adaptability (roles are static even as task demands shift), single points of failure (the orchestrator's failure or misjudgment halts the system), and organizational siloing in cross-organizational settings, where centralization can force agents from different organizations to expose more information to a shared coordinator than they'd like.

## Key innovations

AgentNet contributes three linked mechanisms:

1. **Fully decentralized coordination** — there is no central orchestrator at all; the coordination mechanism itself is distributed, which the authors argue enhances robustness (no single point of failure) and removes the central-bottleneck problem.
2. **Dynamic topology** — the graph of agent connections is not fixed at design time. It adapts in real time: connectivity and task routing shift based on each agent's demonstrated expertise and the current task's contextual demands, rather than static, predefined roles.
3. **Retrieval-Augmented memory** — a RAG-based mechanism gives each agent continuous skill refinement and knowledge accumulation over time, so agents specialize and improve through experience rather than being manually tuned.

## How agents specialize and collaborate

Agents operate as nodes within a DAG whose structure evolves as tasks are processed. Rather than being pre-assigned to fixed roles, agents autonomously decide which connections to form and how to route tasks toward whichever peer agent's demonstrated expertise best matches the task at hand. This is framed as a form of localized, emergent decision-making: overall system intelligence and specialization emerge from many local routing decisions rather than from a central plan, and the RAG memory layer lets an agent's local expertise compound over time as it accumulates retrieval-relevant experience.

A further motivation is privacy: because coordination doesn't require funneling all task/agent information through a central point, AgentNet is pitched as enabling privacy-preserving cross-organizational teamwork, where participating agents from different organizations need not expose proprietary information to a shared central coordinator.

## Experimental results

The paper reports that AgentNet achieved superior accuracy compared to both single-agent baselines and centralized multi-agent system baselines, which the authors present as validation that fully decentralized, dynamically-routed coordination is not just a robustness/privacy improvement but can also outperform centralized designs on task accuracy.

## Relevance and caveats

This paper is one of several 2024–2025 works (alongside MorphAgent and others) exploring decentralized, self-organizing structures for agent teams as an alternative to the still-dominant orchestrator/hierarchy pattern seen in systems like MetaGPT or ChatDev. The abstract-level fetch used here did not surface the specific benchmark tasks, baseline system names, or quantitative accuracy deltas reported in the experiments section — a follow-up read of the full PDF would be needed to extract those numbers precisely.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2504.00587 |
