# LLM-Coordination: Evaluating and Analyzing Multi-agent Coordination Abilities in Large Language Models

Source: https://arxiv.org/abs/2310.03903
Accessed: 2026-07-27

An earlier (2023) but foundational benchmark paper that separates "can an LLM act as a coordinating agent" from "does an LLM understand what coordination requires," via two complementary evaluation tracks — relevant as one of the first systematic looks at theory-of-mind and joint-planning capability in multi-agent LLM settings.

## Purpose

The paper evaluates LLMs' capacity for **pure coordination** — settings where all agents share the same goal and must cooperate to maximize joint gain (as opposed to competitive or mixed-motive settings). It specifically targets "emergent common-sense reasoning and Theory of Mind (ToM) capabilities" as the underlying skills that pure coordination requires.

## Benchmark structure: two complementary components

1. **Agentic Coordination** — LLMs act as live, proactive participants embedded in four pure-coordination games, making real decisions and interacting with other (LLM or scripted) agents in an environment loop.
2. **Coordination Question Answering (CoordQA)** — a separate, static 198-question multiple-choice test that isolates and measures three specific sub-abilities without requiring the model to actually act in an environment:
   - **Environment Comprehension** — does the model correctly understand the state and dynamics of the coordination environment?
   - **Theory of Mind Reasoning** — can the model correctly infer what a partner agent knows, intends, or will do next?
   - **Joint Planning** — can the model construct a plan that accounts for another agent's simultaneous actions?

Separating these two tracks lets the researchers distinguish *behavioral* coordination performance (Agentic Coordination) from the underlying *cognitive* sub-skills (CoordQA) — a model could conceivably act well without demonstrating clean ToM reasoning when quizzed directly, or vice versa.

## Key findings

- LLMs perform relatively well "in scenarios where decision-making primarily relies on environmental variables" — i.e., when the right action can be inferred largely from the state of the world itself.
- LLMs perform substantially worse when the task requires actively modeling a partner's mental state and intentions (the core Theory-of-Mind demand), indicating that current models' apparent coordination competence is partly a function of how much the task can be solved by environment-reading alone versus how much it truly requires reasoning about another mind.
- A notable robustness finding from zero-shot coordination experiments: "LLM agents, unlike RL methods, exhibit robustness to unseen partners." This is a meaningful point of contrast with the multi-agent reinforcement learning literature, where policies trained via self-play or population-based training are notoriously brittle when paired with novel, previously-unseen partners at test time — LLM-based agents, drawing on broad pretraining rather than narrow self-play, generalize better to new partners without additional training.

## Conclusions

The study concludes there is genuine potential for LLMs as coordination agents, given their partner-robustness advantage over RL-trained coordination policies, but flags Theory-of-Mind reasoning and collaborative/joint planning as concrete, measurable gaps that need to close before LLM-based coordination can be considered reliable for complex pure-coordination tasks.

## Relevance to the swarming-agent literature

This paper's ToM-vs-environment-reliance distinction is a useful lens for interpreting later, more architecture-focused papers (AgentNet, CodeCRDT): those systems largely sidestep the ToM problem by making coordination state observable in a shared environment (CRDT, DAG topology) rather than requiring agents to model each other's mental states directly — which, per this paper's findings, is exactly the sub-skill where LLMs are weakest. In other words, "coordinate via shared, observable state" architectures may be popular precisely because they route around LLMs' documented ToM weakness rather than solving it.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2310.03903 |
