# AgentGroupChat-V2: Divide-and-Conquer Is What LLM-Based Multi-Agent Systems Need

Source: https://arxiv.org/abs/2506.15451 (PDF: https://arxiv.org/pdf/2506.15451)
Accessed: 2026-07-27

A systems paper introducing a divide-and-conquer multi-agent framework whose ablations show specialized role division scaling *positively* with team size while homogeneous (identical-agent) configurations scale *negatively* — direct, quantitative evidence that role specialization, as a design variable independent of fixed-vs-dynamic assignment, matters and matters more as teams grow.

## Authors and framing

Authors: Zhouhong Gu, Xiaoxuan Zhu, Yin Cai, Hao Shen, Xingzhou Chen, Qingyi Wang, Jialin Li, Xiaoran Shi, Haoran Guo, Wenxuan Huang, Hongwei Feng, Yanghua Xiao, Zheyu Ye, Yao Hu, Shaosheng Cao.

The paper positions itself against frameworks that face "critical challenges in system architecture design, cross-domain generalizability, and performance guarantees, particularly as task complexity and number of agents increases" — i.e., the specific failure mode where adding more agents to a system doesn't reliably help, or actively hurts, without the right organizational design.

## AgentGroupChat-V2's three core mechanisms

1. **Divide-and-conquer, fully parallel architecture**: decomposes a user query into a **hierarchical task forest**, enabling explicit dependency management and distributed concurrent processing rather than a single linear pipeline.
2. **Adaptive collaboration engine**: dynamically selects *heterogeneous* LLM combinations and interaction modes based on the characteristics of the task at hand — the framework itself decides which models/roles to deploy per sub-task rather than using a fixed roster for every task.
3. **Agent organization optimization strategies**: combines divide-and-conquer decomposition with role-assignment logic for efficient problem breakdown.

Note the architecture itself is *not* a purely fixed-role system — the "adaptive collaboration engine" is explicitly dynamic about which LLMs/roles get used per task. The paper's relevance to the wiki's hypothesis is less about its own architecture and more about a specific ablation result on role specialization vs. homogeneity.

## The specialization-vs-homogeneity ablation

The key comparison for this wiki's question: the authors report that **specialized role division and homogeneous agent configuration exhibit completely opposite performance trends as the number of agents increases.** Concretely:
- With **specialized roles**, accuracy rises from an average of **32.5% at 2 agents to 53.5% at 5 agents** — a **64.6% relative improvement**, i.e. adding agents helps *because* each new agent takes on a distinct, non-overlapping responsibility.
- With **homogeneous agents** (identical role/capability, doing redundant or undifferentiated work), performance instead **deteriorates** as agent count grows — more identical voices do not straightforwardly average out to a better answer, and appear to introduce noise, redundancy, or coordination overhead without a compensating specialization benefit.

## Benchmark results for the full system

Beyond the ablation, the full AgentGroupChat-V2 system posts strong absolute numbers: **91.50% on GSM8K** (+5.6 points over the best baseline), **30.4% on the competition-level AIME** (nearly double other methods), and **79.20% pass@1 on HumanEval**. The advantage grows with task difficulty — on Level 5 MATH problems, the improvement over state-of-the-art baselines exceeds **11 percentage points**. This pattern (bigger gains on harder problems) is broadly consistent with the idea that structure/specialization pays off more when a single generalist agent would be overwhelmed by problem complexity, and pays off less on easy tasks where any reasonable approach succeeds.

## Relevance to the fixed-vs-dynamic-roles question

This is one of the cleanest quantitative demonstrations in this source set that **role specialization itself** — distinct, non-redundant responsibilities per agent — is a first-order driver of multi-agent performance at scale, independent of whether those roles are permanently fixed or adaptively assigned. It complements "Multi-Agent Teams Hold Experts Back" (which shows *unstructured* teams fail to leverage expertise) and the AutoGen/CrewAI practitioner guidance (which asserts specialization anecdotally): here the claim is backed by a controlled ablation with specific accuracy numbers. However, it is important not to over-read this as support for *static, permanently-defined* roles specifically — AgentGroupChat-V2's own architecture assigns roles adaptively per task via its "adaptive collaboration engine," so the paper's evidence supports "specialize, don't duplicate" more directly than it supports "specialize once, and never let that assignment move."
