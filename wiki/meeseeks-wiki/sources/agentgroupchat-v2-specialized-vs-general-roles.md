# AgentGroupChat-V2: Divide-and-Conquer Is What LLM-Based Multi-Agent Systems Need

Source: https://arxiv.org/abs/2506.15451 (HTML: https://arxiv.org/html/2506.15451)
Accessed: 2026-07-27

A controlled parameter-sensitivity experiment on a hard math benchmark that directly compares fine-grained, specialized role division against a homogeneous "everyone has the same role" configuration as agent count scales up, finding opposite performance trends — specialized roles improve with scale, homogeneous roles degrade with scale — which is strong, mechanism-explained support for the hypothesis that static role specialization improves multi-agent outcomes.

## Experimental setup

The comparison uses MATH-100, a set of 100 randomly-sampled Level-5 (hardest tier) problems from the MATH dataset, specifically constructed by the authors for a parameter-sensitivity analysis of their AgentGroupChat-V2 framework. Two role-assignment strategies are compared while varying team size from 2 to 5 agents:

- **General Role**: every agent in the team is given the identical "math expert" identity/system prompt — a homogeneous, undifferentiated team.
- **Specialized Role**: agents are given a fine-grained division of labor mapped onto distinct stages of mathematical problem-solving cognition (i.e., different agents are responsible for different cognitive sub-tasks within solving a problem, fixed for the run).

## Results — accuracy by agent count

| Agents | Specialized Role accuracy | General Role accuracy |
|---|---|---|
| 2 | ~32.5% | ~34.5% |
| 3 | ~40% | ~33% |
| 4 | ~48% | ~32% |
| 5 | 53.5% | 31.5% |

At team size 2, the homogeneous/general configuration actually slightly beats the specialized one (34.5% vs 32.5%) — the advantage of specialization is not present at the smallest scale. From 3 agents onward, the two configurations diverge sharply and keep diverging.

## Headline finding: opposite scaling trends

The paper states the two configurations "exhibit completely opposite performance trends when the number of agents increases: the former [specialized] improves with more agents while the latter [homogeneous] deteriorates." Specialized-role accuracy rises from ~32.5% (2 agents) to 53.5% (5 agents), a 64.6% relative gain, with the authors attributing roughly 7 percentage points of accuracy to each additional specialized agent added. General-role accuracy instead falls from 34.5% to 31.5% (an 8.7% relative decline) as more identically-configured agents are added.

## Explanation offered

The authors attribute the homogeneous configuration's decline to redundancy: agents with the same role/identity tend to generate overlapping, repetitive contributions rather than complementary ones, so adding more of them adds noise and coordination overhead without adding new problem-solving capability. Specialized agents, by contrast, each cover a different part of the problem space, so additional agents contribute genuinely new capability up to at least 5 agents in this experiment.

## Relevance to the static-vs-dynamic-roles hypothesis

This is a cleaner isolation than most: team size is held as the controlled variable and role-differentiation is the sole manipulated variable (specialized vs. identical), with roles fixed for the duration of each run in both conditions — this is not a fixed-vs-dynamically-reassigned comparison, but it does directly test the hypothesis's core claim that assigning agents distinct, non-interchangeable static roles increases the value of adding more agents to a team, compared to a same-role (undifferentiated) baseline. The one caveat: at only 2 agents, general (non-specialized) was marginally better, so the claimed benefit of specialization is scale-dependent rather than universal in this dataset — it only reliably dominates once at least 3 differently-specialized agents are in the team.

| Ingest Date | Source |
| ----------- | ------ |
| 2026-07-27 | https://arxiv.org/abs/2506.15451 |
