# Multi-agent Reinforcement Learning: A Comprehensive Survey

Source: https://arxiv.org/abs/2312.10256
Accessed: 2026-07-27

A 2023/2024 survey by Dom Huh and Prasant Mohapatra that grounds multi-agent reinforcement learning (MARL) in game theory and machine learning foundations — the pre-LLM theoretical bedrock that later LLM-swarm coordination work (SwarmBench, AgentNet, phase-transition studies) either builds on or reacts against.

## Abstract framing

"Multi-agent systems (MAS) are widely prevalent and crucially important in numerous real-world applications, where multiple agents must make decisions to achieve their objectives in a shared environment." The survey's stated aim is to place recent MARL advances against seminal game-theory (GT) and machine-learning (ML) concepts, treating MARL as the research area studying data-driven decision-making within MAS. Authored by Dom Huh and Prasant Mohapatra (v1: December 2023, v2: July 2024).

## Connecting game theory, ML, and MARL

The survey positions MARL as the synthesis point of three lineages: game theory supplies the formal apparatus for modeling agent interactions, payoff structures, and strategic equilibria (Nash equilibria, zero-sum vs. general-sum games); machine learning supplies the learning/optimization machinery (function approximation, gradient-based policy improvement); and MARL combines these to let multiple agents learn concurrently in a shared environment where each agent's optimal policy depends on the (changing) policies of the others.

## Taxonomy and organization

The survey organizes the field along several axes:

**Environment characteristics** — fully observable vs. partially observable settings; deterministic vs. stochastic dynamics; and scalability considerations as the number of agents and the size of state/action spaces grow.

**Interaction types** — fully cooperative scenarios (agents share aligned objectives), competitive/adversarial settings (zero-sum or general-sum games), and mixed settings combining cooperative and competitive elements (i.e., what the collaboration-mechanisms survey elsewhere calls "coopetition").

**Training architectures** — Centralized Training with Decentralized Execution (CTDE), where agents can access shared information during training but must act on local information alone at deployment; fully decentralized learning, where agents never share a centralized training signal; and communication-enabled variants, where agents learn what to communicate as part of the policy itself.

**Learning mechanisms** — value-based methods adapted to multi-agent settings (multi-agent Q-learning and its variants), policy-gradient approaches, actor-critic architectures, model-based learning strategies, and mechanisms for learning communication protocols and emergent coordination directly from experience.

**Credit assignment** — the problem of attributing how much each individual agent contributed to a shared/global reward signal, addressed via counterfactual reasoning methods and reward-shaping techniques.

## Key algorithms and methods referenced

Multi-agent Q-learning and independent-learner frameworks; Nash-equilibrium-seeking methods; multi-agent actor-critic variants; multi-agent adaptations of Proximal Policy Optimization (PPO); and learned communication-protocol mechanisms.

## Open challenges

- **Scalability** — "scaling learning to hundreds or thousands of agents remains computationally prohibitive," a central bottleneck for real-world deployment of large agent populations.
- **Non-stationarity** — because every agent's policy is changing simultaneously, each individual agent faces a constantly shifting learning target, which complicates convergence guarantees (this is the same underlying phenomenon that the "kernel drift" phase-transition paper in this source set formalizes mathematically).
- **Credit assignment** — determining individual contribution under shared/global rewards remains technically difficult.
- **Communication overhead** — learning effective communication protocols without excessive bandwidth or information-exchange cost.
- **Theoretical guarantees** — establishing convergence conditions and optimality proofs for decentralized learning algorithms remains largely open.

## Future directions

The survey points to graph neural networks for scalable agent representations, transfer learning for faster adaptation across tasks, meta-learning for rapid policy adjustment to new partners/environments, human-AI collaboration within MAS, hierarchical architectures blending centralized and decentralized components, and application domains such as robotics, traffic control, and resource allocation.

## Relevance to LLM-based swarm research

This survey predates the wave of LLM-based multi-agent systems and is grounded entirely in classical RL/game-theoretic formalism (explicit reward functions, policy gradients, Nash equilibria) rather than natural-language-driven agents. It is nonetheless directly relevant as the theoretical vocabulary (CTDE, non-stationarity, credit assignment) that LLM-multi-agent researchers implicitly draw on or deliberately avoid — for instance, LLM-Coordination's finding that LLM agents (unlike RL-trained policies) generalize well to unseen partners is best understood as a direct response to the non-stationarity/partner-generalization problem this survey identifies as a core open MARL challenge.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2312.10256 |
