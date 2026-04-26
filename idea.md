# Meeseeks Concept

This is an ideation document for a locally-hosted web app that coordinates human and agentic collaboration on tasks through the stages of a development process.

The problem Meeseeks is built to solve is attention management. A productive workday may involve dozens of concurrent agents — each doing useful work, each capable of needing human input at any moment. The naive UX for this situation is overwhelming: the user is bombarded with console output, interrupted constantly, and forced to context-switch on the agent's schedule rather than their own. Meeseeks is designed around the opposite model: the human controls focus, not the agent.

The primary UX mechanism for this is the detachable console. Each agent interaction happens in a console window that the user can dismiss at any time without terminating the agent. Dismissing the console is the fundamental gesture of the application — it means "I'm done attending to this right now, keep going." The agent continues working; the user moves on. The user re-enters on their own schedule through the parent Ticket.

This single gesture — dismiss without losing access — shapes the rest of the architecture. The Ticket is the stable anchor point precisely because consoles come and go. Liberal permission scope exists to reduce how often agents stop and demand attention in the first place. Every design decision in this document is downstream of preserving the human's ability to stay focused on one context at a time.

A human operator uses the web interface to manage work, while agents run as Runtimes that the app layer can spawn, monitor, and terminate. Human-initiated Runtimes are bound to a specific Ticket — the Ticket is the stable anchor point for accessing, monitoring, and terminating the agent.

## Runtimes

A Runtime is the execution environment for an agent in Meeseeks — always an agentic harness, always short-lived and task-focused. Runtimes fire, do work, and exit; they have no cheap idle state and are never used to watch for conditions or coordinate other Runtimes. That orchestration responsibility belongs to the app layer, which owns Runtime lifecycle: spawning, monitoring, and serializing them.

Runtimes have two trigger modes: human-initiated and autonomously-triggered.

**Human-initiated Runtimes** are spawned by a button on a scoped UI element — for example, a Ticket. Clicking it opens a floating console window where the user can direct the agent as they would any interactive CLI session. Closing the console does not terminate the Runtime; this is the primary dismiss gesture. The agent continues; the user moves on.

Token generation stopping is the meaningful lifecycle event. This happens when the agent completes its task or hits an action outside its permitted scope requiring human approval. Both conditions surface as status on the parent Ticket. From the Ticket, the user can reopen the console at any time to review session history or continue directing the agent, and can terminate the Runtime explicitly when done.

**Autonomously-triggered Runtimes** are fired by the app layer on an event or schedule. They run a specific prompt with no human interaction. The app layer is responsible for ensuring these Runtimes are not run concurrently when serialization is required. It does this by holding a lock per trigger: it will not spawn a new Runtime if the previous one is still running, and re-triggers if conditions still warrant it after the run completes. This prevents race conditions without relying on timing or polling cadence.

## Projects, Boards, and Lanes

Meeseeks is organized around Kanban concepts: a Board is a Kanban board, Lanes are swimlanes, and Tickets are work items that move through process states as they progress. The hierarchy exists to support multiple workflows (Lanes) across multiple codebases or concerns (Boards) within a single workspace (Project).

A Project is a `project.meeseeks` configuration file that lists Board locations. It is the unit the UI opens — analogous to opening a project in a desktop application. By default, new users create a project folder and add Boards as subfolders within it via the UI. Advanced users can register Boards from arbitrary filesystem locations by editing the project config directly.

Boards live outside and independently from the folders they operate on (e.g. a git repo) rather than containing them. Concretely, a Board is a folder. Lanes are subfolders within a Board, and process states are subfolders within a Lane. A Lane encapsulates a process for Tickets to progress through — directly analogous to a swimlane on a Kanban board, where column position represents state.

Each Lane has a PROCESS.md that serves as the instruction document for agents operating within it — defining stages, transition rules, and Lane-specific conventions. Changes to PROCESS.md are expected to be infrequent; because agent instances are short-lived, mid-flight inconsistency from a change is not a significant concern. New Lanes are seeded with a default PROCESS.md as a starting point.

Each Lane also contains a `permissions.yaml` file that specifies which filesystem paths agents operating in that Lane are permitted to access. This is a singleton config file scoped to the Lane; other Lane-level concerns have their own independent config files rather than sharing a single manifest.

Skills, MCP servers, and other contextual configurations of agents will be scoped to Boards. Each Board contains a `CLAUDE.md` file at its root — this is the primary mechanism for loading agent context, conventions, and behavioral instructions when an agent starts. Agents are started with the Board folder as their working directory so that `CLAUDE.md` is automatically discovered. Git repositories are the typical — but not required — locations where agents perform work to address tickets; they are targets of agent action, not part of the ticket storage model.

Agent permission scope is controlled via a path-allowlist model rather than OS-level isolation. A Lane's `permissions.yaml` serves a dual purpose: defining what agents are allowed to touch, and determining how much interrupt overhead the human experiences. Without liberal permissions, every file operation becomes a human interrupt. Strict permissions suit sensitive Lanes; broader scope reduces interrupts where the risk is low and throughput matters.

## Storage Models
Data models in Meeseeks are primarily markdown files in folder structures. A ticket is a markdown file, possibly with frontmatter, whose location in the folder hierarchy encodes its state — it lives in the process state subfolder of its Lane. Moving a ticket between states is literally moving the file between state folders.

Boards can also accumulate shared domain knowledge at the Board level — for example, a markdown knowledge base built up as agents progress, with ingestion defined as a Board-level autonomously-triggered Runtime.

Additional storage done through skills or plugins configured at the Board level.

## Synchronization

Boards can synchronize with external ticket systems, but the key design point is that the app layer requires no integration logic to do so. There is no connector framework, no field-mapping configuration, no conflict resolution code. The agent is the integration layer.

A sync integration is a Board-level configuration consisting of a prompt and a trigger — either a schedule or an external event (e.g., a webhook indicating that an issue has changed). The app layer fires the Runtime with that prompt and gets out of the way. The agent reads the current state of the Board, fetches changes from the external system using whatever tools it has available, and resolves conflicts intelligently — applying judgment about which system is authoritative for which fields, what constitutes a real conflict versus a trivial difference, and how to surface ambiguous cases. Adding a new integration means writing a prompt, not writing code.

The same model covers inbound alert sources. A Runtime prompted to monitor a Slack channel or PagerDuty feed, triggered on a schedule or webhook, will parse what it finds, determine whether new incidents warrant tickets, and create them on the Board — with no integration code required. The human receives a notification when a new ticket appears. Bidirectional sync and inbound triage are the same primitive.

This also means the fidelity of the integration scales with agent capability rather than being fixed by the integration layer. An agent can handle edge cases that a rigid field-mapping system would either reject or silently corrupt.

Each sync integration is serialized by the app layer using the same lock mechanism described above: the app layer will not spawn a new Runtime if the previous one is still running. On the happy path, sync Runtimes produce no notifications.
