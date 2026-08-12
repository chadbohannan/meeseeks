# OpenAI Swarm: Educational Multi-Agent Orchestration Framework

Source: https://github.com/openai/swarm
Accessed: 2026-07-27

This is OpenAI's own repository README for Swarm, a lightweight experimental framework for multi-agent orchestration; it is relevant as the reference example of the "handoff" architectural pattern that many later frameworks (including OpenAI's own production successor) adopted.

## What it is

Swarm is described by OpenAI as an "educational framework exploring ergonomic, lightweight multi-agent orchestration," managed by OpenAI's Solutions team rather than the core product org. It is explicitly *not* positioned as production infrastructure — the README states it exists for developers "curious to learn about multi-agent orchestration." It has since been superseded by the OpenAI Agents SDK, described as the production-ready evolution with active maintenance; Swarm itself is essentially frozen/archived as a teaching artifact.

## Design philosophy

Swarm's stated goals are threefold: agent coordination should be **lightweight**, **highly controllable**, and **easily testable**. The framework is pitched as most useful "in situations dealing with a large number of independent capabilities and instructions that are difficult to encode into a single prompt" — i.e., when a monolithic system prompt becomes unwieldy and splitting responsibilities across specialized agents is clearer than cramming every instruction into one context.

A core architectural choice: Swarm runs "almost entirely on the client" and is stateless between calls, deliberately mirroring the stateless design of the underlying Chat Completions API. This is a explicit contrast to OpenAI's Assistants API, which manages threads/memory server-side. Swarm's philosophy is that orchestration logic should live in ordinary Python code the developer controls, not in an opaque managed service.

## Core abstractions

- **Agent**: encapsulates a set of instructions (a system prompt, which can be a static string *or* a function that dynamically generates the prompt from context) plus a set of Python functions it can call. An agent is essentially a bundle of "personality + tools."
- **Handoffs**: the central multi-agent mechanism. Any function an agent calls can *return another Agent object* instead of (or in addition to) a normal value. When that happens, control of the conversation transfers to the new agent. This is how Swarm implements delegation — not through a rigid supervisor hierarchy, but through agents handing off control to whichever agent's function got invoked. The README frames this as enabling "flexible workflows rather than rigid hierarchies" — the handoff graph emerges from what functions get called, not from a fixed org chart.
- **Result object**: a wrapper return type that lets a single function call simultaneously (a) return a value to be added to the conversation, (b) trigger an agent switch, and (c) update context variables — bundling three effects that would otherwise require three separate return channels.
- **Context variables**: a plain dictionary of application state that is threaded through the whole run — available both to agent instruction functions (so prompts can be templated with live state) and to the Python functions agents call (so tools can read/write shared state).
- **Functions**: ordinary Python functions attached to an Agent; Swarm auto-converts their signatures into JSON schemas for the Chat Completions function-calling API, so the developer just writes normal Python and Swarm handles the schema plumbing.

## The client.run() loop

Execution is a simple imperative loop, not a hidden state machine:

1. Get a completion from the currently active agent.
2. If the completion includes tool/function calls, execute them and append their results to the message history.
3. If a function call returned a new Agent (a handoff), switch the active agent.
4. Merge any context variable updates returned by functions.
5. If there are no new function calls to process, stop and return.

`client.run()` takes the message history, the starting agent, the context variables dict, a max-turns cap, and an optional model override. It returns a `Response` bundling the updated message list, the agent that was active at the end of the run, and the final context variables — so a caller can inspect exactly which agent ended up "holding" the conversation and resume from there on a subsequent call.

## Notable framing

The README is unusually explicit that Swarm is a teaching tool, not a foundation to build production systems on directly — a contrast worth noting against frameworks like CrewAI and AG2 that market themselves as production-ready from day one. Its handoff-via-function-return pattern is architecturally significant: it's a peer-to-peer/dynamic-topology model (any agent can hand off to any other agent it has a function for) rather than a fixed centralized-orchestrator model, even though in practice many Swarm examples use a triage/orchestrator agent as the initial entry point.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://github.com/openai/swarm |
