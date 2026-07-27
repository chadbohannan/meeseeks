# LangSmith Sandboxes

LangSmith Sandboxes are managed isolated environments in which agents can execute code and manipulate files without touching the host infrastructure. They are the first-party execution backend for [Deep Agents](../systems/deep-agents.md) — the one bundled with [`dcode`](../systems/deep-agents-code.md) by default, requiring no extra install — and the substrate [Managed Deep Agents](../systems/managed-deep-agents.md) provisions automatically. They are generally available across GCP US/EU/APAC and AWS US.

Where the [interpreter](../concepts/deepagents-interpreters.md) is a capability-scoped QuickJS runtime for composing tools in-process, a sandbox is a genuine container boundary for acting on an environment: shell commands, package installs, test runs, and full filesystem access. The [backends](../concepts/deepagents-backends.md) page covers how a sandbox plugs in as the agent's filesystem; this page covers the platform features around it.

## Snapshots

A **snapshot** is a reusable filesystem bundle backed by a Docker image, and it is how a sandbox gets a purpose-built starting state. Snapshots can be built by pointing at any Docker image (blocking until ready, default 60-second timeout), pulled from private registries through a persistent registry object referenced by ID, or built **directly from a local `Dockerfile`** without publishing an image first — LangSmith spins up a temporary builder sandbox, uploads the build context, runs the build inside it with BuildKit, and tears the builder down automatically.

The more interesting direction is capture: a snapshot can be taken *from a running sandbox*. Install packages, write data files, configure state, then snapshot the result and boot future sandboxes from it. For agent work this is the natural way to amortize expensive environment setup across many runs, and it is what `dcode`'s `--sandbox-snapshot-name` flag targets.

## The auth proxy and egress control

The auth proxy is the mechanism that lets sandbox code call external APIs **without ever holding credentials**. A proxy sidecar injects authentication headers into matching outbound requests using workspace secrets or write-only credentials supplied in the proxy config — so the agent's code sends an unauthenticated request and the proxy makes it authenticated in flight. Secrets must be configured in LangSmith workspace settings before a sandbox references them.

The same `proxy_config` doubles as network access control, and the **default egress posture** is worth stating precisely because it is easy to assume the opposite:

- **HTTP and HTTPS (ports 80 and 443) to any host are allowed**, transparently routed through the proxy where credential-injection rules apply.
- **All other raw TCP is blocked** — databases on 5432, SSH on 22, Redis on 6379 — unless explicitly opened.

The docs make a clarifying point: raw protocols are not blocked because the proxy cannot speak them, but because they are denied by default and opened per host and port through `access_control`, which accepts *either* an `allow_list` or a `deny_list` but rejects a config setting both. So the boundary is deliberately permissive for web traffic (since that is where credential injection adds value) and deliberately restrictive for everything else.

## Mounts

Mounts attach external data sources to the sandbox filesystem at creation time — S3 buckets, GCS buckets, and public Git repositories — so sandbox code gets direct file access without copying data into the image. Each mount has an `id`, `type`, and an absolute `mount_path` under `/mnt/mounts`. The SDK composes the auth-proxy rules for provider credentials automatically, and the docs warn explicitly that cloud credentials must be stored as **workspace secrets**, never passed as sandbox environment variables, command arguments, or files.

## Service URLs

Each sandbox-plus-port combination can be exposed as an authenticated URL, giving browser or programmatic access to an HTTP service running inside the sandbox — a REST API, a Streamlit app, a Jupyter notebook — with no tunnels, port forwarding, or CLI tooling. This is what makes a sandbox usable as a live preview environment rather than only a batch execution target, which is directly relevant to any orchestrator that wants to show a human the *running result* of agent work rather than a transcript describing it.

## Access permissions

Every sandbox records a **creator**: the workspace member whose API key or session created it. By default *only the creator* can perform runtime actions, and other workspace members need the `sandboxes:exec` [RBAC](../concepts/langsmith-observability.md) permission. Sandboxes are never reachable from a workspace other than the one that created them — cross-workspace requests are *hidden*, treated as not found rather than denied, which avoids leaking existence.

"Runtime actions" is a specific set of four: executing commands, file operations, tunnelling a TCP port back to a local machine, and proxying requests through a service URL. Lifecycle operations — create, list, update, delete — remain governed by the separate `sandboxes:create`/`read`/`update`/`delete` permissions. Denied requests return HTTP 403 naming the rule that fired.

That creator-scoped default is a notable design choice: it means a sandbox is private to its creator unless a workspace deliberately grants broader execution rights, which is the right default for an environment that may hold a customer's data and a live credential proxy.

## Access paths

Sandboxes are reachable through a Python or TypeScript SDK, a `langsmith sandbox` CLI (create sandboxes, run commands, open interactive consoles, build snapshots, tunnel TCP ports), and the LangSmith UI for managing sandbox resources. They also serve as the execution substrate for Harbor evaluations and rollouts, tying them into the [evaluation](../concepts/langsmith-evaluation.md) story.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-25 | https://docs.langchain.com/langsmith/sandboxes |
| 2026-07-25 | https://docs.langchain.com/langsmith/sandbox-snapshots |
| 2026-07-25 | https://docs.langchain.com/langsmith/sandbox-auth-proxy |
| 2026-07-25 | https://docs.langchain.com/langsmith/sandbox-mounts |
| 2026-07-25 | https://docs.langchain.com/langsmith/sandbox-service-urls |
| 2026-07-25 | https://docs.langchain.com/langsmith/sandbox-permissions |
