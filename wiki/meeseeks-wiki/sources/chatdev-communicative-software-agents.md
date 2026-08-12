# ChatDev: Communicative Agents for Software Development

Source: https://arxiv.org/abs/2307.07924 (paper, ACL 2024) and https://medium.com/data-science/paper-review-communicative-agents-for-software-development-103d4d816fae (detailed secondary review of the paper's architecture and results)
Accessed: 2026-07-27

This is the ChatDev paper (ACL 2024) plus a detailed third-party review of it, relevant as a "virtual software company" architecture that, like MetaGPT, imposes waterfall-style process structure on multi-agent collaboration, but distinguishes itself with a specific dehallucination mechanism and fine-grained duo-role chat decomposition worth contrasting against MetaGPT's SOP approach.

## Framing: a virtual chat-powered company

ChatDev models itself as a "virtual, chat-powered software development company" that mirrors the classic waterfall model: **designing → coding → testing → documenting**, executed as four sequential phases, each of which recruits a different set of specialized agents suited to that phase's work. This is architecturally similar to MetaGPT's role-pipeline idea, but ChatDev's distinguishing mechanism is *how* it structures the actual conversations within and across phases.

## Chat chains: decomposing phases into atomic exchanges

Rather than having one agent "do" an entire phase in one shot, ChatDev breaks each phase down into a **chat chain** — a sequence of atomic, two-agent chat exchanges, each targeting one specific, narrow subgoal that contributes toward the phase's overall objective. Outcomes propagate sequentially down the chain, so by the time a phase concludes, its result is the accumulated product of many small, targeted dialogues rather than one large, unconstrained agent output — this granularity is the paper's primary lever against hallucination and error accumulation.

## Duo-role communication pattern

Every individual chat within a chain involves exactly two agents playing complementary roles:
- **Instructor**: initiates the exchange and guides the task, effectively directing the sub-task.
- **Assistant**: follows the instructor's direction and performs the work.

The pair continues multi-turn dialogue until they mutually agree the sub-task is complete, with consensus signaled through matching structured/formatted messages (the review cites an example format like `<MODALITY>: Desktop Application` as a template both sides converge on to mark agreement) — giving the system a clear, checkable termination condition for each atomic exchange rather than relying on an open-ended stopping heuristic.

## Role organization by phase

Agents adopt different organizational titles depending on the active phase, mimicking a real company's org chart:
- **Designing**: CEO, CTO, CPO
- **Coding**: CTO, Programmer, Designer
- **Testing**: Programmer, Reviewer, Tester
- **Documenting**: CEO, CPO, CTO, Programmer

The same underlying agents shift roles/titles across phases (e.g., the CTO participates in designing, coding, and documenting), rather than each agent being permanently bound to one fixed identity for the whole project.

## Communicative dehallucination mechanisms

The paper's central technical contribution is a bundle of mechanisms aimed specifically at reducing hallucinated/incorrect code, going beyond MetaGPT's SOP-based approach:
1. **Phase decomposition** itself — generating an entire codebase in one shot is what produces confusion and inconsistency; granular per-phase, per-subtask generation constrains the scope of what any single generation step must get right.
2. **Cross-examination**: the paper identifies that a lack of targeted, specific feedback on an agent's work is what allows incorrect code to persist uncorrected; ChatDev's role pairs are structured to give that targeted review/feedback rather than passive acceptance.
3. **Thought instruction**: a technique of temporarily swapping which agent plays CTO vs. Programmer to force a large task to be broken into smaller, more tractable focused implementations — using the role-swap itself as a decomposition trick.
4. **Memory management**: previous versions of generated code are deliberately purged from working memory to prevent the model from anchoring on and repeating earlier hallucinated content.

## Memory model

ChatDev's memory streams are simpler than the "generative agents" style memory (which typically includes retrieval + reflection modules over a large memory store): here, memory is just the conversation history scoped to the current phase and chain. The paper argues this is sufficient specifically because the sequential, decomposed structure of phases/chains already makes relevant prior information predictable and locally accessible — i.e., the architecture itself does the work that a more general retrieval system would otherwise need to do.

## Reported experimental results (across 70 generated software tasks)

- Average of **17.04 files** generated per software project.
- Generated code length ranged 39–359 lines, averaging **131.61 lines**.
- Average **development cost of $0.2967** per generated application (LLM API cost).
- Average **development time of 409.84 seconds** — framed against traditional custom development taking weeks to months.
- The system identified and resolved over 20 categories of code vulnerabilities and over 10 categories of potential bugs during its testing phase.

## Acknowledged limitations

The paper/review notes: code output remains non-deterministic even at low sampling temperature; generated software can misalign with actual user needs due to UX/requirement misunderstanding; visual/style inconsistency can appear in designer-generated assets; the underlying model (GPT-3.5-Turbo-16k at time of publication) constrained how complex a generated application could be; and the paper does not include direct empirical comparison against contemporaneous baselines like GPT-Engineer or MetaGPT, nor a full human evaluation involving real software engineers, UX experts, testers, and end users — the evaluation is largely automated/self-reported metrics.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2307.07924 |
| 2026-07-27 | https://medium.com/data-science/paper-review-communicative-agents-for-software-development-103d4d816fae |
