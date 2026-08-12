# Improving Role Consistency in Multi-Agent Collaboration via Quantitative Role Clarity

Source: https://arxiv.org/abs/2604.02770 (HTML: https://arxiv.org/html/2604.02770)
Accessed: 2026-07-27

A follow-up-style paper that takes the MAST taxonomy's "disobey role specification" failure mode as its direct starting point and builds a measurable, trainable metric for role clarity, then shows that optimizing for it materially improves both role adherence and task success — direct evidence that role-specification clarity (not fixed-vs-dynamic assignment per se, but how sharply a role is defined and enforced) is a load-bearing performance variable.

## Motivating problem, explicitly tied to MAST

Authors: Guoling Zhou, Wenpei Han, Fengqin Yang, Li Wang, Yingcong Zhou, Zhiguo Fu.

The paper opens from the same failure mode the MAST taxonomy (Cemri et al.) names "disobey role specification" — defined here as "failure to adhere to the defined responsibilities and constraints of an assigned role, potentially leading to an agent behaving like another." Where MAST measured this failure's prevalence (1.5% of annotated failure instances) and moved on, this paper isolates role-specification adherence as its sole variable of interest and asks: can it be measured continuously, and does optimizing it help? This is exactly the "deeper published analysis of that gap" the wiki maintainer's hypothesis asked about.

## What "quantitative role clarity" means

The authors define role clarity as a differentiable, continuous metric rather than a binary "did the agent violate its role or not" label:
- Construct a **role assignment matrix S(φ)** using cosine similarity between an agent's *behavior embeddings* (what it actually did) and its *role description* (what it was supposed to do), for every agent pair.
- Apply row-wise softmax to produce a **role clarity matrix M(φ) = softmax(S(φ)) − I**.
- Reduce this to a scalar **role clarity score C(M(φ)) = 1 / (1 + ‖M(φ)‖_F)**.

This construction is deliberately built to have three properties the authors call out: it captures *global* deviation (not just pairwise), it is *monotonically* related to consistency (clearer role adherence → higher score), and it is *continuously differentiable*, meaning it can be used directly as a training signal (a regularizer) rather than only as a post-hoc evaluation metric.

## Methodology: role clarity as a fine-tuning regularizer

Using **ChatDev** (a MetaGPT-style, role-pipeline multi-agent software-dev framework) as the testbed, the authors:
- Ran **Qwen2.5-7B** and **Llama-3.1-8B** as the underlying agent models.
- Collected behavior trajectories via rejection sampling on the **SWE-Dev** benchmark.
- Applied **LoRA fine-tuning** with the role clarity score added as a regularization term in the training objective — i.e., the model is explicitly pushed, during training, toward outputs whose embeddings are more consistent with the stated role and less consistent with other agents' roles.
- Evaluated on both **SWE-Dev** (measuring role consistency directly) and **SRDD** (measuring end-to-end task performance).

## Results

Role-overstepping rate (how often an agent behaved like a different role than assigned) dropped sharply for both models:
- **Qwen2.5-7B**: overstepping rate fell from **46.4% → 8.4%**; clarity score rose from **0.5328 → 0.9097**.
- **Llama-3.1-8B**: overstepping rate fell from **43.4% → 0.2%**; clarity score rose from **0.5007 → 0.8530**.

Task success rate improved alongside role consistency, though more modestly:
- **Qwen2.5-7B**: 67.69% → 69.09%.
- **Llama-3.1-8B**: 61.74% → 67.63% (the larger jump of the two).

## Relevance to the fixed-vs-dynamic-roles question

This paper doesn't argue for fixed roles over dynamic ones as an architectural choice — ChatDev already has fixed, named roles (a pipeline of specialized agents), and the intervention is entirely about making adherence to those *already-fixed* roles sharper and more measurable. That's an important distinction for the wiki's hypothesis: the evidence here is that **role clarity/enforcement, independent of whether roles are fixed or dynamic, is what drives the performance gain** — a poorly-enforced fixed role can drift just as badly as an ambiguous dynamic one. It complements the MAST paper's finding that role-specification failures are individually rare (1.5%) but implies the rarity may partly reflect that most tested frameworks already had *reasonably* clear (if unenforced) role text — this paper shows there's still headroom to gain by making that clarity quantitatively rigorous rather than assuming a role name and a paragraph of backstory is sufficient.
