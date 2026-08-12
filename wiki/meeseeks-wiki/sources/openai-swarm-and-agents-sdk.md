# OpenAI Swarm (and its production successor, the Agents SDK)

Source: https://github.com/openai/swarm
Accessed: 2026-07-27

The repository and documentation for OpenAI's Swarm, an experimental lightweight multi-agent orchestration framework released in 2024 and explicitly deprecated in favor of the production-grade Agents SDK; relevant as the industry's clearest public example of a major AI lab explicitly labeling a multi-agent framework "not for production" and naming what replaced it.

## What it is

Swarm is described as "an educational framework exploring ergonomic, lightweight multi-agent orchestration," built on top of OpenAI's Chat Completions API rather than the (stateful) Assistants API. Its stated design goal is "making agent coordination and execution lightweight, highly controllable, and easily testable" — prioritizing developer legibility over automatic/managed behavior.

## Core abstractions

- **Agents**: the primary building block, encapsulating a set of instructions and available tools. Notably, an "Agent" in Swarm's model is not necessarily meant to represent an autonomous, general-purpose entity — the docs frame it as potentially representing just "a very specific workflow or step" within a larger pipeline, i.e., agents can be narrow and single-purpose rather than broad generalists.
- **Handoffs**: agents transfer execution to other agents via ordinary function calls. This enables dynamic, decentralized routing between agents without requiring a single centralized orchestrator process to manage the handoff — routing logic lives in the agents/tools themselves.

## Design philosophy: stateless and client-side

Unlike the Assistants API, which manages conversation state and memory server-side, Swarm runs **almost entirely client-side** and is **stateless between calls** — mirroring the underlying Chat Completions API's own architecture. This was a deliberate simplicity/control tradeoff: the developer's own code is fully responsible for persisting and passing state between turns, rather than relying on a hidden server-side session.

## Stated limitations and production status

The documentation is explicit that Swarm is meant for **learning and experimentation, not production deployment**. It's positioned as useful for situations involving "a large number of independent capabilities" that are hard to encode into a single prompt, but developers who need fully-hosted conversation threads and built-in memory management are told to look elsewhere.

## Production successor

The repository carries an explicit deprecation notice: **"Swarm is now replaced by the OpenAI Agents SDK, which is a production-ready evolution of Swarm,"** with an explicit recommendation to migrate to the Agents SDK for all production use cases. This is a useful concrete data point for the wiki: OpenAI itself validated (by building and then retiring Swarm) that the "lightweight handoff between narrow agents" pattern was worth exploring, but judged the original stateless/client-only implementation insufficiently robust for real production workloads — durability, state management, and hosting were the gaps that the Agents SDK was built to close.

## Relevance to swarming-agent practice generally

Swarm's two abstractions — narrow single-purpose Agents plus explicit Handoffs as the coordination primitive — are a recurring pattern across the industry sources in this collection: it's structurally similar to Cognition's "manager delegation" pattern and to the general read-vs-write distinction LangChain's writeup emphasizes (Swarm's handoff model assumes each agent takes ownership of a step before handing off, rather than multiple agents writing concurrently). Its retirement is a useful cautionary data point: a clean conceptual model for agent coordination doesn't by itself guarantee production-readiness — state management, hosting, and durability turned out to be the harder, unglamorous problems that determined whether the framework could be trusted with real workloads.
