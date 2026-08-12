# CrewAI: Role-Based Crews and Event-Driven Flows

Source: https://docs.crewai.com/ and https://docs.crewai.com/concepts/crews
Accessed: 2026-07-27

This is CrewAI's official documentation, relevant as the clearest example of the "role-based team of specialized agents" architectural philosophy, paired unusually with an explicit second, event-driven paradigm (Flows) for when pure agent autonomy isn't controllable enough.

## Two complementary building blocks

CrewAI's documentation frames the framework around a deliberate duality:
- **Crews**: teams of AI agents that collaborate *autonomously* through role-based decision-making. This is the "let the agents figure it out together" mode.
- **Flows**: production-ready, *event-driven* workflows that give the developer explicit control over automation — start/listen/router steps, explicit state management, persistence, and the ability to resume long-running executions.

The existence of both primitives in one framework is itself a design statement: pure autonomous role-play (Crews) is good for open-ended collaborative reasoning, but real production systems often need deterministic control flow around/between the autonomous parts (Flows), and CrewAI treats that as a first-class need rather than an afterthought bolted onto an agent framework.

## Agents: role, goal, backstory

Agents in CrewAI are defined with a role-based signature (documentation examples reference Researcher, Writer, Coder, Analyst-style specializations), each carrying a **role**, **goal**, and **backstory** — the backstory is notable as a distinguishing feature versus most other frameworks: it's a persona-priming mechanism, giving the LLM narrative context about who it is supposed to be, on the theory that persona framing shapes output quality/consistency more than bare instructions alone. Agents are also composed with tools, memory, knowledge sources, and can produce structured outputs via Pydantic models.

## Crews: composition and process types

A `Crew` is instantiated with `agents`, `tasks`, and a `process` (plus options like `verbose`, `memory`, `cache`, `max_rpm`, and callback hooks). Two process types:
1. **Sequential**: tasks execute strictly in declared order, one after another, each able to reference the outputs of prior tasks as context — a linear pipeline.
2. **Hierarchical**: a manager agent (requiring a configured `manager_llm`) sits above the crew, delegating tasks to member agents and validating/orchestrating progress before allowing the crew to advance — i.e., an explicit centralized-orchestrator variant layered on top of the flat agent pool.

Minimal example from the docs:
```python
from crewai import Crew, Process

crew = Crew(
    agents=[agent_one, agent_two],
    tasks=[task_one, task_two],
    process=Process.sequential,
    verbose=True
)
result = crew.kickoff(inputs={})
```
Crews can also be declared via YAML/JSON-style config files, which the docs recommend over inline Python for maintainability at scale.

## Callback system and memory

CrewAI exposes multiple hook points: a **step callback** (fires after each individual agent step/action), a **task callback** (fires on task completion), and **before/after-kickoff callbacks** around the whole crew run — giving fine-grained observability/intervention points without needing to fork the framework's internals. Memory support spans short-term, long-term, and entity memory, letting agents recall context across a run (and, depending on configuration, across runs) to improve decision quality on later tasks.

## Tools and interoperability

CrewAI agents can be equipped with tools spanning web search, other LLMs used as sub-tools, data analysis utilities, and arbitrary custom functions. Notably, CrewAI documentation also references support for MCP and A2A — i.e., it explicitly positions itself as interoperable with the emerging protocol layer (Model Context Protocol for tool access, Agent2Agent for cross-framework agent communication) rather than a closed ecosystem, plus enterprise integrations (Gmail, Slack, Salesforce) and deployment/access-control features aimed at production teams.

## Design philosophy summary

The tagline in the docs is to "ship multi-agent systems with confidence" via built-in guardrails, memory, knowledge, and observability. The architecture reflects a considered middle ground: role-based collaboration (Crews) for tasks that benefit from agents reasoning together like a staffed team, and explicit event-driven orchestration (Flows) for the parts of a system that need deterministic, debuggable control — an implicit critique of frameworks that force everything through open-ended agent autonomy.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://docs.crewai.com/ |
| 2026-07-27 | https://docs.crewai.com/concepts/crews |
