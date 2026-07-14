# LangChain Guardrails

Meeseeks exists to *supervise* agents, but its supervision is about attention and lifecycle, not content safety — nothing in the platform inspects what an agent is about to do for policy violations. Guardrails are LangChain's answer to that concern, and they are worth documenting here precisely because they occupy a role Meeseeks has no equivalent for. Per the guardrails overview (`docs.langchain.com/oss/python/langchain/guardrails`), guardrails "validate and filter content at key points in your agent's execution" — detecting PII, blocking prompt injection, enforcing compliance, and validating outputs before they cause problems.

## Guardrails are middleware

The key architectural fact: guardrails are not a separate subsystem. They are implemented as [middleware](langchain-middleware.md) that intercepts execution at strategic points — before the agent starts, after it completes, or around model and tool calls. That means everything true of middleware is true of guardrails: they are in-process code running inside the compiled LangGraph, they can extend agent state and register tools, and — critically for supervision — they can halt or redirect execution. This is the same control seam that is the direct analog to Claude Code's external hooks, but used for policy enforcement rather than lifecycle signalling.

The docs split guardrails along a familiar axis:

- **Deterministic guardrails** — rule-based logic (regex, keyword matching, explicit checks). Fast, predictable, cheap, but blind to nuance.
- **Model-based guardrails** — an LLM or classifier evaluates content with semantic understanding. Catches subtle violations rules miss, but slower and more expensive.

## Built-in: PII detection and human-in-the-loop

Two prebuilt guardrails ship in the box. **`PIIMiddleware`** detects common PII (email, credit card with Luhn validation, IP, MAC address, URL, plus custom regex detectors) and handles each type with a configurable strategy — `redact` (`[REDACTED_EMAIL]`), `mask` (`****-1234`), `hash`, or `block` (raise an exception). It can check user input (`apply_to_input`), model output (`apply_to_output`), and tool results (`apply_to_tool_results`) independently, and in recent versions also redacts streamed wire output — text deltas, tool-call args, tool outputs, state snapshots — via a registered stream transformer, so the [rendering layer](langchain-frontend-rendering.md) never receives the raw PII either.

The second built-in is **`HumanInTheLoopMiddleware`**, which the docs frame explicitly as "one of the most effective guardrails for high-stakes decisions." It turns designated tool calls into durable [interrupts](human-in-the-loop.md) requiring approval — `interrupt_on={"send_email": True, "delete_database": True, "search": False}` — pausing on sensitive operations and auto-approving safe ones. This is the guardrail most relevant to Meeseeks: an orchestrator supervising a coding agent could gate destructive tools (database writes, external sends, force-pushes) behind human approval as a first-class, resumable pause rather than the fragile `permission_prompt` detection Meeseeks reverse-engineers from Claude Code (see the [sandboxing runbook](../runbooks/claude-code-sandboxing.md)).

## Custom guardrails: before/after agent

Beyond the built-ins, custom guardrails are ordinary middleware hooks. A **`before_agent`** hook validates each request once at the start — session-level authentication, rate limiting, or blocking banned content before any processing — and can short-circuit by returning a canned message plus `jump_to: "end"`. An **`after_agent`** hook validates the final output once before it reaches the user — the documented example is a model-based safety check that asks a small model whether the response is `SAFE` or `UNSAFE` and rewrites it if not. Both use the middleware `can_jump_to` mechanism to skip the rest of the agent loop.

## Layered protection

Because guardrails are just middleware in a list, they stack and execute in order, giving layered defense: a deterministic input filter (`before_agent`), then PII redaction on input and output, then human approval on sensitive tools, then a model-based safety scan (`after_agent`). Each layer is independent and composable.

## The gap this fills for Meeseeks

This is a capability category Meeseeks simply does not have. Claude Code's permission model (allow/deny tools, OS sandboxing) is *access control* — can the agent call this tool at all — but there is no content inspection: no PII redaction, no prompt-injection detection, no output-quality gate. LangChain's guardrails sit at a different layer, inspecting *what flows through* the tools rather than *which tools exist*. For a platform whose pitch is safe human oversight of autonomous agents, guardrails-as-middleware are the mechanism that would let Meeseeks enforce content policy in-band — and because they are the same middleware objects as everything else in the [prebuilt catalog](langchain-middleware.md), adopting them costs nothing beyond the harness adoption itself.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/guardrails |
| 2026-07-11 | https://docs.langchain.com/oss/python/langchain/middleware |
