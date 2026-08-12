# AutoGen / AG2: Conversation-Centric Multi-Agent Framework

Source: https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/ (architecture); https://rohitarya18.medium.com/autogen-0-7-architecture-ag2-a-smart-city-blueprint-for-building-multi-agent-ai-systems-ee51b4296be4 and https://sanj.dev/post/autogen-microsoft-multi-agent-framework (fork history and version-split context)
Accessed: 2026-07-27

AutoGen is Microsoft Research's multi-agent framework and one of the most-cited examples of the "conversation as the orchestration substrate" architectural philosophy, notable also for having forked into two divergent lineages (community AG2 vs. Microsoft's actor-model AutoGen 0.4) — a useful case study in how a framework's community and its steward can diverge on architecture.

## Origin and fork history

AutoGen originated at Microsoft Research in Fall 2023, a collaboration involving Microsoft, Penn State, and University of Washington researchers. In late 2024 its original creators, Chi Wang and Qingyun Wu, left Microsoft and forked the project into **AG2** (AutoGen 2.0), a community-governed continuation that deliberately preserves the original AutoGen 0.2 architecture and API for stability/backward compatibility. Meanwhile Microsoft's own AutoGen line diverged sharply with **AutoGen 0.4**, a full architectural rewrite built on an actor-model, layered design aimed at distributed, event-driven, cross-language, enterprise-grade systems (this is the lineage that fed into Microsoft's broader "Agent Framework"). This means "AutoGen" today refers to two architecturally different things depending on which lineage/version you mean — an important disambiguation for anyone citing it.

## Core abstraction: ConversableAgent

The foundational unit in the 0.2/AG2 lineage is `ConversableAgent` — a generic base class for any agent that can send and receive messages to/from other agents to collaboratively complete a task. The framework's defining idea is that agents are simultaneously **conversable** (message-passing is the universal interface between agents) and **customizable** (a ConversableAgent can be backed by an LLM, a human, a tool/code executor, or any combination — the same abstraction covers all participant types).

## Key agent types

- **AssistantAgent**: an LLM-backed agent that plays the role of an AI assistant. Given a task description, it generates a solution (typically Python code), and on receiving execution results, it evaluates them and proposes fixes/refinements. Its behavior is tuned via the system message and LLM inference config, not via custom code.
- **UserProxyAgent**: represents the human/environment in the loop. By default it solicits human input at each turn, but it can also auto-execute code blocks it detects in incoming messages, and — with an `llm_config` supplied — can itself generate LLM responses instead of only forwarding to a human. Its `human_input_mode` setting is the main lever for how autonomous vs. supervised a run is.

## Conversation pattern

A canonical exchange: `user_proxy.initiate_chat(assistant, message=...)` kicks off the loop — (1) the user_proxy sends a task description, (2) the assistant generates code, (3) the user_proxy either executes the code automatically or asks a human, (4) results flow back to the assistant which refines its answer, and the cycle repeats until a termination condition (e.g., task success signal) is met. This is architecturally a *dialogue-driven* orchestration model: control flow is not a fixed DAG but an emergent property of what messages agents send each other.

## Beyond two-agent chat: dynamic group topologies

AutoGen explicitly supports moving past static, predefined agent topologies toward **dynamic** conversations where the set/order of participating agents adapts to how the conversation is actually unfolding. Named patterns include:
- Registered auto-reply functions that implement ad hoc hierarchical chat structures.
- **GroupChat** with a manager agent that dynamically selects which agent should speak next (a lightweight centralized dispatcher sitting above a flat pool of peer agents).
- LLM-driven function calls that decide, at runtime, which agent(s) should be pulled into the conversation next.

This makes AutoGen's philosophy a hybrid: individual exchanges are peer-to-peer conversational turns, but many real deployments layer a coordinating "manager" or orchestrator on top of the raw ConversableAgent primitive to keep multi-agent group chats coherent.

## Human-in-the-loop and code execution

Autonomy is a spectrum, not binary: `human_input_mode` on UserProxyAgent can range from fully autonomous execution to requiring a human's sign-off at every step. Code execution is typically sandboxed (e.g., inside Docker containers configured on the UserProxyAgent), with stdout/stderr/exceptions fed back into the message stream so the AssistantAgent can see real execution feedback rather than just static code review — an early and influential instance of the "give the agent a feedback loop from real execution" pattern also seen in MetaGPT and ChatDev.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://microsoft.github.io/autogen/0.2/docs/Use-Cases/agent_chat/ |
| 2026-07-27 | https://rohitarya18.medium.com/autogen-0-7-architecture-ag2-a-smart-city-blueprint-for-building-multi-agent-ai-systems-ee51b4296be4 |
| 2026-07-27 | https://sanj.dev/post/autogen-microsoft-multi-agent-framework |
