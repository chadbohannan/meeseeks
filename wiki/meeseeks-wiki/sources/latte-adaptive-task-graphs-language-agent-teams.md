# Improving the Efficiency of Language Agent Teams with Adaptive Task Graphs (LATTE)

Source: https://arxiv.org/abs/2605.06320 (PDF: https://arxiv.org/pdf/2605.06320)
Accessed: 2026-07-27

A framework paper that explicitly frames the design space as a spectrum from "fixed roles/pipelines assigned a priori" to "fully unstructured teams," and introduces a middle path — a shared, dynamically-evolving coordination graph — that it benchmarks directly against MetaGPT (the archetypal fixed-role pipeline system) and other rigid designs.

## Explicit problem framing: two extremes, both flawed

Authors: Elizabeth Mieczkowski, Alexander Ku, Tiwalayo Eisape, Dilip Arumugam, John Matters, Katherine M. Collins, Ilia Sucholutsky, Thomas L. Griffiths.

The paper's opening framing is unusually direct about the exact question this wiki source-set is investigating: "existing coordination approaches often occupy two extremes. Highly structured methods rely on fixed roles, pipelines, or task decompositions assigned a priori. In contrast, fully unstructured teams enable adaptability and exploration but suffer from inefficiencies such as error propagation, inter-agent conflicts, and wasted resources (measured in time, tokens, or file operations)." Both poles are treated as having known, named failure modes — rigidity on one side, chaos costs on the other — rather than either being assumed as a default best practice.

## LATTE: a shared, evolving coordination graph

**LATTE** (Language Agent Teams for Task Evolution) is explicitly inspired by distributed systems theory, treating agents as processors operating "under partial observability and communication constraints." Its core mechanism: a team of agents collaboratively construct and maintain a **shared, evolving coordination graph** that encodes (a) sub-task dependencies, (b) individual agent assignment to sub-tasks, and (c) the current state of each sub-task's progress. Unlike a fixed pipeline, this graph is mutable during execution — agents can dynamically reallocate work, adapt the coordination structure itself, and discover and add new sub-tasks that weren't anticipated at the outset — while the graph structure itself keeps the team's shared state consistent, addressing the "unstructured teams" failure mode of conflicting or divergent views of what's been done.

## Benchmarking against fixed-role systems, including MetaGPT by name

Critically, LATTE is evaluated head-to-head against **MetaGPT** (fixed five-role SOP pipeline), **decentralized teams** (unstructured), **top-down Leader-Worker hierarchies**, and **static task decompositions** — i.e., it directly benchmarks against the fixed-role architectural family this wiki is investigating, not just against strawman baselines. Across multiple collaborative tasks and multiple base models, the paper reports that LATTE **reduces token usage, wall-clock time, communication overhead, and coordination failures (e.g., file conflicts and redundant outputs) while matching or exceeding the accuracy of all of these standard fixed/rigid designs**, MetaGPT included.

## What the paper does not resolve

The available extraction of this paper's content does not surface an explicit statement of when a permanently fixed-role pipeline (like MetaGPT) would still be preferable to LATTE's adaptive graph — the reported results are framed as a general efficiency and accuracy win for the adaptive approach across the tested task/model combinations, without a stated regime where fixed roles win outright. This is a gap worth flagging rather than papering over: it is possible (as "Drop the Hierarchy and Roles" suggests for a different set of protocols) that a capability threshold or task-predictability threshold exists below which MetaGPT-style fixed pipelines remain competitive, but this paper's summary does not identify one.

## Relevance to the fixed-vs-dynamic-roles question

LATTE is arguably the most direct architecture-level rebuttal to fixed-role pipelines in this source set, precisely because it benchmarks against MetaGPT by name rather than against a generic "unstructured baseline." Combined with "Drop the Hierarchy and Roles," it forms a consistent pattern across two independent research groups: **when adaptive/self-organizing coordination is compared against a named, real fixed-role architecture on matched tasks, the adaptive approach tends to match or beat it on both efficiency and accuracy** — though neither paper claims this holds unconditionally across all task types or model capability levels.
