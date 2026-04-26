# Incident Response Wiki — Schema & Operating Rules

The wiki is for the `meeseeks` project. Use `meeseeks*`in code-rag filter globs.

This is a persistent, LLM-maintained knowledge base for capturing complex system behavior, incident patterns, debugging knowledge, and operational wisdom. The LLM writes and maintains all wiki content. The human curates sources, directs investigation, and asks questions.

## Purpose
This is a development wiki. It collates knowledge and understand of the requirements, design, tests, and delivery of a specific project.

## Directory Layout

```
wiki/
├── AGENTS.md          # This file — schema and operating rules
├── raw/           # Raw, immutable input documents (the LLM never adds or modifies the files or folder contents without express permission)
├── wiki/              # LLM-generated and LLM-maintained markdown pages
│   ├── index.md       # Content catalog — the structured routing layer
│   ├── log.md         # Chronological record of all operations
│   ├── systems/       # Distinct systems, services, and deployments
│   ├── components/    # Individual components, libraries, and dependencies
│   ├── concepts/      # Recurring patterns, failure modes, and architectural concepts
│   ├── runbooks/      # Operational procedures
│   └── syntheses/     # Cross-cutting analyses, comparisons, and thematic summaries
└── scripts/           # Helper scripts for processing raw sources
```


## Page Conventions

Wiki pages are prose documents. They have no YAML frontmatter. The directory a page lives in determines its category. The first heading serves as the title.

Internal links use relative paths and are embedded in context — every link should appear inside a sentence that explains why the relationship matters. A link to another page is a claim about a connection, and the surrounding prose is the evidence.

As a footer, a table of references should be maintained that corroborates log.md.
Each row of the ref table includes a timestamp of the most recent impact of a source,
and the name/path to the source material. Only markdown from the `raw` directory
or properly formatted URLs should be formatted as links. Relative paths outside the wiki are unreliable and do not port between checkouts of this system.

```markdown
# Page Title

Opening paragraph establishing what this page covers and why it matters.

Body paragraphs with contextual links woven in. For example: "Under high
task throughput, the BigQuery exporter HPA scales up and creates additional
connections through the [connection pool](../components/connection_pool.md),
which has a hard ceiling of 200 backend connections."

| Ingest Date | Source |
| ----------- | ------ |
| 2026-01-09 | [20260109-1420-sync-incident](../../raw/20260109-1420-sync-incident.md) |
| 2026-01-09 | `repo-name/go/src/router.go` |
```

Source attribution is inline. When a factual claim traces to a specific source, cite it naturally: "The March 2026 design spec (`20260316-spec-pubsub-outside-transaction.md`) evaluated three options..." or "According to the operational architecture documentation..." This gives citations semantic context — the reader understands not just *what* the source is, but *what claim it supports and why it was consulted.*

### Naming Conventions

- **Systems**: `{system-name}.md`
- **Components**: `{component-name}.md`
- **Concepts**: `{concept-name}.md`
- **Runbooks**: `{procedure-name}.md`
- **Syntheses**: `{analysis-topic}.md`

Filenames are lowercase, hyphenated, and descriptive.

### Writing Style

Every sentence should earn its place. A short, precise page is better than a long, vague one.

Cross-references are a first-class feature. When creating or updating a page, consider what other pages should link here, and what this page should link to. But every link must be contextual — no "see also" lists at the bottom. If a relationship can't be explained in a sentence, it probably isn't meaningful enough to link.

When new information contradicts existing wiki content, don't silently overwrite. Note the contradiction explicitly, cite both sources, and flag it for the user. If a claim comes from a single source or is speculative, say so.

## The Index

`index.md` is the structured routing layer for the wiki. It is the first thing an LLM reads when answering a query, and the primary mechanism for navigating the wiki at scale.

Each entry is a link with a one-line description. Entries are grouped by category. For incidents, the description should include severity and the affected system so that an LLM (or a script) can triage without opening the page.

```markdown
# Wiki Index

## Systems
- [System Name](systems/system-name.md) — one-line description

## Incidents
- [2026-01-09: g4c-sub-01 API OOM Kill](incidents/2026-01-09-sub-01-api-oom.md) — SEV-2, all 6 API pods OOMKilled due to memory request misconfiguration

## Components
- [Component Name](components/component-name.md) — one-line description

## Concepts
- [Concept Name](concepts/concept-name.md) — one-line description

## Runbooks
- [Procedure Name](runbooks/procedure-name.md) — one-line description

## Syntheses
- [Analysis Topic](syntheses/analysis-topic.md) — one-line description
```

The index is updated on every ingest. As the wiki scales, the index may grow to include additional structured hints (severity tags, component names, date ranges) to support pre-filtering — but this is done in the index itself, not in individual pages.

## The Log

`log.md` is a chronological, append-only record of wiki operations. Each entry is a single line  of simple markup with a consistent prefix for parsability:

```
[YYYY-MM-DD] operation | [Subject](../raw/source-file.md) — brief description of what happened
```

For ingest operations, the subject should be a relative link to the source document. Other operations use plain text subjects.

Operations: `ingest`, `query`, `lint`, `enrich`, `update`.

## Discovery Layers

The wiki operates alongside `code-rag`, a semantic code search service that indexes source code repositories. These serve complementary roles:

- **The wiki** captures interpreted knowledge — failure patterns, architectural understanding, operational wisdom, troubleshooting history. Things that don't exist in the code itself.
- **code-rag** provides discovery over source code repositories — function signatures, configuration files, implementation details. Use `code-rag` when a question needs grounding in actual code.
- **index.md** is the routing layer between the two. An LLM reads the index to find relevant wiki pages, and uses `code-rag` to drill into source code when the wiki points toward a specific component or behavior.

During enrichment, `code-rag` searches should be used liberally to find implementation details that strengthen wiki pages. Findings are integrated as prose with citations to the specific code paths.

## Operations

### Ingest

When the user provides a new source (a postmortem, debug log, code snippet, architecture doc, Slack thread, commit history, etc.):

1. **Read** the source fully.
2. **Discuss** key takeaways with the user — what's important, what's surprising, what connects to existing knowledge. Keep this brief (3-5 sentences).
3. **Create or update** wiki pages:
   - Create or update entity pages for every system, component, or concept mentioned.
   - Create or update incident pages if the source describes an incident.
   - Extract any operational procedures into runbook pages.
   - Weave cross-references into the prose of every page touched — both the new/updated pages and existing pages that should now link to them.
   - Enhance the quality of content with references discovered with `code-rag`.
   - Update references to ingested material.
4. **Update index.md** — add or revise entries for every wiki page touched. Source material is not written to; do not clutter index.md with source material links. 
5. **Append to log.md** — one entry line recording the ingest.
6. **Report** to the user: what pages were created/updated, what connections were found, what gaps remain.

### Query

When the user asks a question:

1. **Read index.md** to identify relevant pages to begin exploring the wiki.
2. **Read** the relevant wiki pages, follow relevant links.
3. **Use code-rag** if the question needs grounding in source code.
4. **Synthesize** an answer with citations to wiki pages and original sources.
5. If the answer is substantial and reusable, **offer to ingest it** to improve the wiki for future queries.
6. **Log** the query.

### Lint

When the user asks for a health check (or periodically when the wiki has grown):

1. Check for **contradictions** between pages.
2. Find **orphan pages** — pages not linked from any other page (check via grep for the filename across all wiki pages; index.md links don't count).
3. Identify **mentioned-but-missing** entities that deserve their own page.
4. Flag **stale pages** via `git log` — pages not updated in a long time relative to their subject matter.
5. Verify **link integrity** — all internal links resolve to existing files.
6. Suggest **new questions** or sources that would fill gaps.
7. Report findings and fix what can be fixed automatically.
8. **Log** the lint pass.

### Enrich

When deeper context could improve clarity:

1. Use `code-rag` to search indexed repositories for relevant source code, architecture patterns, and implementation details. The code-rag tool provides search results across multiple repositories; many are unrelated. Use filter globs to restrict search scope.
2. Integrate findings into wiki pages as prose with citations to specific code paths.
3. Use grep/glob/read on local repositories when code-rag points to specific files worth reading in full.
4. **Log** the enrichment.

## Incident Page Structure

Incident pages don't use a rigid template, but they should cover these aspects in whatever order makes the narrative clearest:

- **Opening summary**: severity, duration, affected services, and outcome in one or two sentences.
- **Timeline**: what happened and when.
- **Root cause**: what actually broke and why.
- **Detection**: how it was noticed — alerts, customer reports, internal observation.
- **Resolution**: what fixed it.
- **Contributing factors**: systemic issues that made this incident possible or worse, with links to relevant concept and component pages.
- **Patterns**: connections to other incidents and recurring failure modes, woven into the narrative rather than listed at the end.
