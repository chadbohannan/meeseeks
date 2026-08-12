# A Survey on LLM-based Multi-Agent System: Recent Advances and New Frontiers in Application

Source: https://arxiv.org/abs/2412.17481
Accessed: 2026-07-27

This is a broad, well-cited (125-paper) 2024/2025 survey by Guo, Chen, Wang, Chang, Pei, Chawla, Wiest, and Zhang (Harbin Institute of Technology and collaborators) that proposes a definitional framework for LLM-based multi-agent systems (LLM-MAS) and organizes the field's applications into three buckets — directly relevant as a map of the whole research area for the swarming-agent wiki.

## Formal definition

The survey defines an LLM-MAS as "a system that includes a collection of generative agents capable of interacting and collaborating within a shared environmental setting," where LLMs serve as the core control/reasoning mechanism for each agent.

## Core components

**Generative agents** are characterized by four essential capabilities:
- **Profiling** — role descriptions given in natural language or via customized prompts per agent, establishing persona/specialization.
- **Memory** — multi-layered storage (long-term, short-term, sensory) that enables coherent behavior across long trajectories.
- **Planning** — formulating behavior patterns and sub-goals across extended timeframes.
- **Action** — executing interactions with the environment (tool calls, messages, etc.).

Agents communicate either through natural language (high interpretability, harder to optimize algorithmically) or through custom/structured content (more optimizable, but opaque to human observers).

**Environment** is decomposed into three structural elements:
- **Tools** — translate an agent's instructions into concrete outcomes via a defined action space.
- **Rules** — define communication patterns and behavioral structure/constraints among agents.
- **Intervention** — the external interface through which humans or supervisory systems can intervene.

## Application taxonomy

### 1. Solving complex tasks

Two families of approach:

**Reasoning frameworks:**
- *Multi-stage framework* — serial problem-solving across sequential stages, exemplified by ChatDev (Qian et al. 2024) for software development.
- *Collective decision-making* — voting/debate mechanisms converging on a unified answer, e.g., GEDI (Zhao et al. 2024) and Multi-Agents-Debate (Liang et al. 2024).
- *Self-refine framework* — agents iteratively critique and improve their own or each other's outputs, e.g., ReConcile (Chen et al. 2024) and LLM-discussion (Wang et al. 2024).

**Communication optimization:**
- *Speed optimization* — e.g., non-verbal/compressed communication channels between agents (Liu et al. 2024) to cut latency.
- *Distributed discussion* — solving problems when no single agent has complete information, e.g., iAgents (Liu et al. 2024).

**Representative systems:** ChatDev (multi-role software development), MetaGPT (role-based collaborative framework), AgentScope (message-exchange communication with distributed deployment), and OpenAI's Swarm (lightweight multi-agent orchestration framework).

**Benchmarks referenced:** SRDD, SMART, WebShop, HumanEval, EvalPlus, MBPP, ToolBench.

### 2. Simulating specific scenarios

**Social domain:**
- *Tiny society / town simulation* — virtual communities of autonomous agents, exemplified by the Stanford "generative agents" town (Park et al. 2023) with 25 interacting agents.
- *Social media simulation* — modeling user behavior, information spread, and echo chambers, e.g., YuLan-Rec (Wang et al. 2024) built on the MovieLens-1M dataset.
- *Emotional propagation* — sentiment/mood diffusion across agent populations, e.g., S3 (Gao et al. 2023) on the Blog Authorship Corpus.
- *Social movements* — large-scale collective behavior modeling, e.g., SoMoSiMu (Mou et al. 2024) simulating on the order of 10^6 agents.
- *Game scenarios* — strategic gameplay dynamics such as Werewolf (Xu et al. 2024) and Avalon (Lan et al. 2024).
- *Urban systems* — city-scale modeling, e.g., Urban Generative Intelligence / UGI (Xu et al. 2023).
- *Professional domains* — healthcare and legal simulations such as Agent Hospital (Li et al. 2024) and AgentCourt (Chen et al. 2024).

**Physical domain:** mobility/transportation behavior modeling and wireless network coordination (Zou et al. 2023).

**Benchmarks referenced:** WWQA, SoMoSiMu-Bench, AdaSociety.

### 3. Evaluating generative agents

**Evaluation of strategic/emotional capabilities:**
- Arena-based evaluation of long-horizon planning, leadership, and competition, e.g., Auction Arena (Chen et al. 2024) and LLMArena (Chen et al. 2024).
- Theory-of-mind and multimodal emotional-understanding evaluation, e.g., MuMA-ToM (Shi et al. 2024).

**Training uses of multi-agent evaluation:**
- Supervised fine-tuning using multi-agent-generated data, e.g., CoEvol (Li et al. 2024).
- Multi-agent reinforcement learning to overcome biases inherent to single-agent training, demonstrated in Werewolf gameplay (Xu et al. 2023).
- Data synthesis via multi-agent interaction, e.g., Stable Alignment (Liu et al. 2023).

**Benchmarks referenced:** AgentBench, MT-Bench, ChatEval, MLAgentBench, MAgIC, PsySafe, MuMA-ToM.

## Challenges identified

**Challenges from generative agents themselves:**
- *Generalized alignment* — agents struggle to authentically depict diverse personality traits because foundation models are trained toward a narrow, aligned behavioral distribution, limiting honest behavioral variation.
- *Hallucination* — agents exhibit probabilistic hallucination during interaction; mitigation techniques reduce but do not eliminate this.
- *Limited long-text capability* — agents lose track of earlier information in complex, extended interactions due to context-window constraints, degrading performance on knowledge-intensive tasks. The survey suggests multi-step reasoning approaches (citing OpenAI's o1) as a potential mitigation.

**Challenges from agent interactions:**
- *Efficiency explosion* — autoregressive LLM inference is inherently slow, and each agent action may require multiple LLM queries (retrieval, planning, execution), so cost/latency scales poorly — potentially exponentially — as the number of agents in an LLM-MAS grows. Partial mitigation: replacing peripheral agents with rule-based logic (as in SoMoSiMu-Bench), though this breaks down for agents needing complex action spaces.
- *Accumulative effect* — errors compound round over round in multi-agent interaction, undermining reliability. Attempted solutions include rule-based error-correcting intermediaries and architectures like Internet-of-Agents (IOA) for improved scalability. The survey points to alignment-based optimization (the OPTIMA framework) and industrialized parallel message processing (AgentScope) as promising but still-nascent directions.

**Challenges evaluating LLM-MAS:**
- *Lack of objective group-behavior metrics* — multi-agent environments are diverse, complex, and unpredictable; current evaluation largely relies on comparing distributions between simulated and real environments, giving limited insight into internal LLM-MAS processes.
- *Automated evaluation and benchmark deficiencies* — no unified benchmarks exist for comparing systems within the same category, and there is no common framework spanning individual-agent and population-level assessment.

## Future directions

The survey calls out large-scale LLM-MAS as an emerging research hotspot for studying scale effects, and highlights the need for common test benchmarks and standardized evaluation methodologies applicable across most LLM-MAS implementations.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2412.17481 |
