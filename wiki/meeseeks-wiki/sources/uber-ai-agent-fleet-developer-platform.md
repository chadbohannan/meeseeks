# How Uber Uses AI for Development (multi-agent developer platform)

Source: https://newsletter.pragmaticengineer.com/p/how-uber-uses-ai-for-development
Accessed: 2026-07-27

A Pragmatic Engineer newsletter deep-dive (drawing on interviews with Uber engineering leadership, including Engineering Director Anshu Chada and platform engineer Ty Smith) on how Uber operationalized AI coding agents — including orchestrating multiple parallel agents per engineer — across its entire engineering organization; useful here as one of the few detailed, named, large-scale-enterprise accounts of running a fleet of agents in daily production developer workflows, with concrete adoption and cost numbers.

## Strategic framing

Uber's stated AI strategy is not "automate everything" but to eliminate **toil** specifically — dependency upgrades, migrations, trivial bug fixes — freeing engineers for higher-value/creative work. Anshu Chada is quoted: "When we push boring stuff to AI, engineers achieve higher satisfaction and can create features in ways we didn't think possible."

## Four-layer agentic architecture

1. **Internal AI platform**, built on top of Uber's existing ML platform (Michelangelo), which provides model gateways to both frontier third-party models and internally-hosted models.
2. **Context layer** — agents get access to source code, internal documentation, Slack, and JIRA tickets, functioning as the agents' "memory" so they can make informed decisions rather than operating blind.
3. **Industry agents** — off-the-shelf tools integrated directly: Claude Code, GitHub Copilot, Codex, and others, rather than Uber building every agent in-house.
4. **Specialized in-house agents** — purpose-built systems for background task execution, test generation, and code review.

## Named internal tools

- **MCP Gateway**: exposes Uber's internal Thrift/Protobuf service endpoints as Model Context Protocol servers, centrally handling authentication, authorization, telemetry, and providing a discovery registry — i.e., a shared infrastructure layer so every agent doesn't reinvent internal-API access and auth.
- **Agent Builder / Agent Studio**: a no-code platform for building multi-agent workflows, with visualization, debugging, versioning, and evaluation built in — explicitly meant to let non-platform engineers construct agent workflows against Uber's internal data sources.
- **AIFX CLI**: manages agent provisioning, MCP server discovery, background task execution, and keeps client tooling versions unified across the whole engineering org.
- Other named but not fully detailed (paywalled) tools: **Minion** (a background agent execution platform), **Shepherd** (used for large-scale migrations), and **Autocover**, which reportedly generates over 5,000 unit tests per month.

## Workflow shift: from serial to parallel agent orchestration

Uber's traditional dev workflow was linear: plan → code → review. The newsletter documents a real behavioral shift where engineers now naturally **run multiple agents in parallel themselves** — quoting platform engineer Ty Smith: "While waiting for one agent, engineers think 'might as well kick off another background agent.'" This is presented as an organic, bottom-up practice rather than something mandated top-down — engineers effectively became ad hoc orchestrators of their own small agent swarms.

## Adoption metrics (as of March 2026)

- **84%** of developers use agentic coding tools.
- **65-72%** of code is generated via IDE-based AI tools.
- **11%** of pull requests are opened directly by agents.
- Claude Code usage specifically jumped from **32% (December) to 63% (February)** — a rapid internal shift in which specific tool engineers preferred.
- Uber's internal background coding agent alone was reported (per a related Uber source found during research, not this newsletter) to produce roughly **1,800 code changes per week**.

## Challenges and costs encountered running this at scale

- **Cost growth**: AI-related expenses increased **6x since 2024**; token-cost optimization has become an explicit organizational priority rather than an afterthought.
- **Adoption dynamics**: top-down mandates to use these tools were *less* effective than organic peer-to-peer sharing of wins — engineers adopted tools faster when a colleague showed a concrete win than when told to by leadership.
- **Platform investment burden**: supporting many different external tools (Claude Code, Copilot, Codex, etc.) simultaneously, plus building the infrastructure to let engineers orchestrate multiple parallel agents safely, required substantial dedicated platform-engineering investment (the MCP Gateway, Agent Builder, AIFX CLI above exist specifically because of this).
- **Code review became a bottleneck of its own**: more AI-generated code produces more review volume and more review "noise" (lower signal-to-noise per review), which pushed Uber to build specialized review tooling (named **uReview** and **Code Inbox**) specifically to handle the increased load from agent-authored changes.

## Relevance to swarming-agent practice

This is a rare account of the *organizational* and *human workflow* side of running agent swarms in production — as opposed to the architecture-only focus of the Anthropic/Cognition/LangChain sources. The key transferable lesson: once individual coding agents become reliable enough, the natural next step for engineers is unprompted informal parallelization (running several agents at once), and the bottlenecks that follow are less about model capability and more about surrounding infrastructure — auth/access gateways, cost controls, and review/verification throughput — echoing the "task verification failures" category identified in the MAST taxonomy (see `mast-why-multi-agent-llm-systems-fail.md` in this directory).
