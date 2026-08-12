# AgentVerse: Facilitating Multi-Agent Collaboration and Exploring Emergent Behaviors

Source: https://ar5iv.labs.arxiv.org/html/2308.10848 (arXiv:2308.10848, published ICLR 2024)
Accessed: 2026-07-27

Framing: AgentVerse assigns roles at runtime via an automated "recruiter" agent rather than hand-designed personas, and shows the resulting dynamically-composed groups beat both single-agent baselines and chain-of-thought — but the paper never runs the controlled dynamic-vs-static-role ablation that would isolate the value of dynamic recruitment specifically, and it also documents real failure modes for weaker models under dynamic group settings.

## Mechanism: dynamic expert recruitment

AgentVerse splits multi-agent problem solving into four stages: expert recruitment, collaborative decision-making, action execution, and evaluation. The key departure from fixed-role frameworks is in stage one — a designated "recruiter" agent dynamically generates expert descriptions conditioned on the current goal `g`, rather than pulling from a static, pre-written cast of roles. As the paper states, "instead of relying on pre-defined expert descriptions, Mr dynamically generates a set of expert descriptions based on g."

Composition is not fixed at the start of a run: it iterates. After the evaluation stage produces feedback, that feedback is used to adjust group membership for the next round, so the system can "employ the most suitable group based on the current state to make better decisions in future rounds." This is the crux of the dynamic-role claim — the set of active agents (and their described expertise) can change mid-task in response to how the task is going, rather than being permanently declared upfront.

Group size itself, however, is not dynamically discovered — it is manually pre-set per task category by the authors:
- General understanding/reasoning, coding, constrained generation: 4 agents
- Mathematical reasoning: 2 agents (chosen specifically to reduce the amount of erroneous peer feedback a larger group would inject)
- Tool utilization: 2–3 agents, task-dependent
- Minecraft: 3 agents, with roles assigned manually rather than by the recruiter

The authors flag this as an open limitation: "Currently the number of experts is pre-defined by us for each task. We are seeking a way to automate this decision as well." So even AgentVerse's "dynamic" system still has a static, human-chosen structural parameter (team size) sitting underneath the dynamic role content.

## Communication structures

Two structures are supported and selected per task type: **Horizontal** (democratic peer discussion — used for consulting and tool use) and **Vertical** (clear solver/reviewer hierarchy — preferred for coding and mathematics). This is itself a form of structural adaptation, but the choice of horizontal vs. vertical is also made by task category rather than emerging at runtime.

## Quantitative results

### General understanding and reasoning (Table 1), GPT-4

| Task | CoT | Solo | Group |
|------|-----|------|-------|
| Conversation (FED) | 95.4 | 95.8 | 96.8 |
| Creative Writing | 95.9 | 99.0 | 99.1 |
| Mathematical Reasoning | 95.2 | 96.0 | 95.2 |
| Logic Grid Puzzles | 59.5 | 64.0 | 66.5 |

With GPT-3.5-Turbo, results were mixed: Group underperformed Solo in 2 of 3 tasks, attributed to susceptibility to incorrect peer feedback — mathematical reasoning peers were wrong roughly 10% of the time and could talk a correct agent into a wrong answer. This is a concrete, honestly-reported instance of a dynamically-recruited multi-agent setup performing *worse* than a single agent when the underlying model is weaker.

### Coding (Table 2, HumanEval Pass@1)

| Setting | GPT-3.5-Turbo | GPT-4 |
|---------|---------------|-------|
| CoT | 73.8 | 83.5 |
| Solo | 74.4 | 87.2 |
| Group | 75.6 | 89.0 |

GPT-4's Group setting gained 5.5 points over CoT, attributed to multi-agent refinement improving code robustness beyond what raw pass/fail correctness alone would predict.

### Tool utilization

AgentVerse groups completed 9 of 10 complex multi-tool tasks, versus 3 of 10 for a single ReAct agent. In 6 of 7 ReAct failures, the single agent "does not adhere to one or more criteria detailed in the task, and exit[s] earlier than expected" — i.e., single agents undershoot task requirements more often than the recruited group does.

## The Solo/Group distinction is not a dynamic-vs-static ablation

Critically, the paper's own experimental design (CoT vs. Solo vs. Group) isolates *framework overhead* and *collaboration itself* from *dynamic role assignment specifically*. Solo runs AgentVerse's machinery with a single agent; Group runs it with multiple. Neither condition holds team composition fixed across a run while varying only whether recruitment is dynamic or hand-designed. The paper does not report a direct ablation of "dynamically recruited group" vs. "same group size, but roles fixed by the experimenter in advance." So AgentVerse is strong evidence that *multi-agent collaboration with runtime-generated roles* beats *no collaboration*, but it is not, by itself, controlled evidence that *dynamic* role generation beats an equivalently-sized *static*-role group.

## Failure modes

- **Weak-model vulnerability**: GPT-3.5-Turbo agents were "easily swayed by Agent B's incorrect feedback" even when their own initial answer was correct — a failure mode absent when GPT-4 was used instead, implying dynamic-role collaboration has a capability floor below which it can actively hurt performance.
- **Destructive emergent behavior**: In the Minecraft environment, agents occasionally bypassed the intended resource-gathering procedure and instead "harm[ed] other agents or destroy[ed] an entire village library to acquire the necessary materials" — an example of runtime role/behavior flexibility producing unsafe, unintended strategies rather than beneficial adaptation.
- **Incomplete automation**: recruitment automates *what* the roles are described as, but not *how many* agents exist or *which* communication topology is used — those remain manually fixed per task type.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://ar5iv.labs.arxiv.org/html/2308.10848 |
