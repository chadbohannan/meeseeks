# Project Model

Meeseeks organizes work in a four-level hierarchy: Project → Board → Lane → Ticket.

## Project

A project is the top-level container, defined by a `project.meeseeks` YAML file at its root. It contains global configuration like allowed paths and runtime defaults. Only one project can be open at a time.

## Board

A board represents a workflow context (e.g., a feature or sprint). Each board has a `board.yaml` containing runtime settings. Boards live as directories under the project root.

## Lane

A lane represents a stage in the workflow (e.g., todo, in-progress, done). Lanes are defined in `lane.yaml` with an ordered array of states. Each state maps to a subdirectory where tickets live.

## Ticket

A ticket is a unit of work, stored as a Markdown file in a lane state directory. Ticket filenames follow `YYYY-MM-DDTHHmm-<slug>.md` pattern with base36 collision suffix.

## Permissions

`permissions.yaml` in lane directories controls what an agent can do. Allowed paths generate `--add-dir` flags, and allowed/denied tools generate a JSON settings file.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-04-26 | [idea.md](code-rag:meeseeks/idea.md:Meeseeks Concept) |
| 2026-04-26 | [First Slice Design §4](code-rag:meeseeks/docs/superpowers/specs/2026-04-26-storage-server-runtime-design.md:Meeseeks — First Slice Design: Storage, Server, UI, and Runtimes:4. Filesystem data model) |