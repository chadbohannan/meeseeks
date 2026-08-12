# Announcing the Agent2Agent Protocol (A2A)

Source: https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
Accessed: 2026-07-27

This is Google's official launch announcement for the Agent2Agent (A2A) protocol, relevant as the leading example of a *cross-vendor interoperability standard* for multi-agent systems, contrasted with the single-framework orchestration approaches (Swarm, AutoGen, CrewAI) — A2A addresses how independently-built agents from different companies/frameworks talk to each other, not how to build agents within one framework.

## Launch context

A2A was announced April 9, 2025, backed at launch by more than 50 technology partners — including Atlassian, Box, Cohere, Intuit, JetBrains, LangChain, MongoDB, Neo4j, PayPal, Salesforce, SAP, ServiceNow, UKG, and Workday — plus major consulting/systems-integrator firms (Accenture, BCG, Capgemini, Cognizant, Deloitte, HCLTech, KPMG, McKinsey, PwC, TCS, Wipro) and observability/infra vendors (Arize AI, C3 AI, Datadog, Elastic, Harness, JFrog, LabelBox, New Relic, UiPath, Weights & Biases). It was released under Apache-2.0 licensing and is now governed by the Linux Foundation, signaling an intent to be a neutral, vendor-independent standard rather than a Google-controlled API.

## Problem being solved

The protocol targets a specific gap: agents built by different vendors, on different frameworks, inside different organizations, historically have no common way to discover each other's capabilities, exchange messages, or coordinate multi-step tasks across trust/organizational boundaries. A2A is Google's proposed interoperability layer for exactly that — agent-to-agent communication across vendor and organizational lines, as opposed to intra-framework orchestration.

## Five design principles (as stated in the announcement)

1. **Embrace agentic capabilities**: agents should be able to collaborate in natural, unstructured ways *without* requiring shared memory, shared tools, or shared context — the protocol doesn't assume a common substrate between the two agents talking.
2. **Build on existing standards**: rather than invent a new wire format, A2A layers on HTTP, Server-Sent Events (SSE), and JSON-RPC — chosen specifically to ease integration into IT infrastructure that already exists.
3. **Secure by default**: A2A is designed to support enterprise-grade authentication/authorization at parity with existing OpenAPI-style auth schemes from day one, not bolted on later.
4. **Support long-running tasks**: the protocol explicitly handles the full range from instant responses to multi-day research tasks, with real-time status/feedback streaming throughout — not just simple request/response.
5. **Modality-agnostic**: A2A is not text-only; it's designed to support audio and video streaming interactions as well as text, anticipating agents that operate across richer media.

## Core protocol concepts

- **Agent Cards**: JSON documents an agent publishes to advertise its capabilities, letting a client agent discover and select an appropriate remote agent to hand work to — analogous to a service's OpenAPI spec but for agent capabilities rather than REST endpoints.
- **Tasks**: the central unit of work; a Task is a protocol object with an explicit lifecycle, supporting both immediate completion and long-running execution with status updates streamed back to the caller.
- **Artifacts**: the outputs agents exchange as the result of a Task — the "answer" or produced content handed back from remote agent to client agent.
- **Messages**: the communication envelope, composed of "parts" — discrete, fully-formed content pieces (text, generated images, etc.) each carrying its own content type, enabling format negotiation between agents that may support different modalities.
- Agents can further negotiate UI capabilities within a conversation — e.g., whether the interaction can include iframes, video, or web forms — treating the "how do we present results" question as part of the protocol, not an out-of-band concern.

## A2A vs. MCP

The announcement explicitly positions A2A as **complementary to, not competing with, the Model Context Protocol (MCP)**: MCP addresses how a single agent gets useful tools and context (giving an agent access to data/functions), while A2A addresses how multiple independent agents discover, message, and coordinate with *each other* at scale, potentially across organizational boundaries. Together they're framed as forming a full interoperability stack — MCP for agent-to-tool, A2A for agent-to-agent.

## Transport and security specifics

Transport is JSON-RPC 2.0 over HTTP/HTTPS for request-response interactions, with Server-Sent Events layered on for real-time streaming updates on long-running tasks — a deliberately language-agnostic choice so agents implemented in any stack can participate. Security uses standard TLS plus OAuth 2.0 for mutual agent authentication and scoped resource access without agents needing to share credentials directly, and JSON Web Tokens (JWTs) for compact, signed authorization tokens.

## Illustrative use case

The announcement's running example is a candidate-sourcing workflow: a hiring manager's agent delegates to specialized remote agents to source candidates matching a job spec, present suggestions back for human review, coordinate interview scheduling, and facilitate background checks — illustrating cross-system, cross-vendor agent coordination on a single business workflow, which is exactly the scenario A2A is designed to make interoperable regardless of which vendor built which agent.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/ |
