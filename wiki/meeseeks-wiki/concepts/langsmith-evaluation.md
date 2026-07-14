# LangSmith Evaluation

Evaluation exists because "LLM outputs are non-deterministic, which makes response quality hard to assess" (`docs.langchain.com/langsmith/evaluation-concepts`). LangSmith Evaluation is a framework for breaking down what "good" means and measuring it across the application lifecycle, from pre-deployment testing to production monitoring. It sits on top of [observability](langsmith-observability.md) within the [LangSmith](../systems/langsmith.md) platform, and for an orchestrator it is the discipline that would answer a question Meeseeks cannot answer today: does one harness or configuration actually produce better results than another?

## Start from examples of "good"

The recommended entry point is manual: curate 5–10 examples of what "good" looks like for each critical component of the system before building any automated evaluation. The docs give component-specific ground truth — for a **RAG system**, examples of good retrievals and accurate answers; for an **agent**, examples of correct tool selection and proper argument formatting or trajectory; for a **chatbot**, helpful on-brand responses. These curated examples become the ground truth that later measures how often the system produces comparable quality.

## Offline vs. online

The framework splits along when evaluation runs:

- **Offline evaluations** — pre-deployment testing against **datasets** of curated **examples** with reference outputs. Used for **benchmarking** (compare versions to find the best), **regression testing** (ensure a new version doesn't degrade), **unit testing** (verify individual components), and **backtesting** (test new versions against historical data). This is the mode that would let Meeseeks compare candidate harnesses on a fixed task suite.
- **Online evaluations** — scoring live production traces as they arrive, for continuous quality monitoring rather than a fixed test set.

## Datasets, examples, and evaluators

A **dataset** is a collection of **examples** (input plus reference output) that defines the test set an offline evaluation targets. An **evaluator** produces the score. LangSmith supports several evaluator kinds: **code evaluators** (deterministic assertions written as functions), **LLM-as-judge** evaluators (a model scores an output against criteria, useful where correctness is subjective), and **composite** evaluators that combine several signals. Evaluators can be bound to datasets, run in CI/CD pipelines, applied to intermediate steps, and — for agents specifically — assess **trajectory** (did the agent take a reasonable sequence of steps) rather than only the final answer.

## The lifecycle loop

Evaluation is not a one-off gate; it closes a loop with the rest of the platform. [Engine](../systems/langsmith.md) generates custom evaluators and ground-truth dataset examples automatically from production traces when it detects a recurring issue, deploying the evaluator to catch regressions of that specific problem. So the same trace store that powers [observability](langsmith-observability.md) feeds both manual evaluation and the automated detect-diagnose-fix-guard cycle — evaluation is how a fix is prevented from silently regressing later.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-11 | https://docs.langchain.com/langsmith/evaluation-concepts |
| 2026-07-11 | https://docs.langchain.com/langsmith/evaluation-types |
| 2026-07-11 | https://docs.langchain.com/langsmith/llm-as-judge |
