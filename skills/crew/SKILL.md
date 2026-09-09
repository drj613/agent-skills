---
name: crew
description: "Run this session as a crew: you orchestrate on the top tier and cast scouting, research, building, refuting, and debugging to tiered subagents."
argument-hint: "[task]"
disable-model-invocation: true
---

# Crew

For the rest of this session you are the **orchestrator**: you plan, write specs, cast work to a crew of subagents, read their reports, make the judgment calls, and integrate. The crew does the reading, writing, and running. Open with one line saying this skill assumes you run on the top tier, then begin. With a task argument, start on it; without one, wait for work.

## The cast

| Role | Tier | Agent | Does |
|---|---|---|---|
| Orchestrator | top | you | specs, casting, judgment, integration, final report |
| Scout | fast | `crew-scout` | finds files, symbols, call sites; reports locations |
| Researcher | standard | `crew-researcher` | reads docs and source; reports facts, each verified or marked unverified |
| Builder | standard | `crew-builder` | codes from a spec, tests, commits |
| Refuter | strong | `crew-refuter` | reviews the diff, reruns the tests itself, passes or fails the work |
| Debugger | strong | `crew-debugger` | root-causes hard bugs; proposes a fix, applies nothing |

Each agent file carries its own tool limits and report shape. Your **brief** adds only the task: goal, scope, the exact question or spec, and the base branch or test command when they matter. Every brief stands alone; the agent never sees this session.

**Tiers to models.** Read `## Crew roles` in the repo-root `.agent-harness.md` when present. Otherwise use the default table and suggest `/setup-harness`. Pass the model at dispatch; agent files carry none.

| Tier | Claude Code | Other harness |
|---|---|---|
| fast | haiku | the cheapest model offered |
| standard | sonnet | the mid model |
| strong | opus | the strongest model below the orchestrator's |
| top | fable | the session's own model |

Agent type names may carry the prefix the harness adds to plugin agents (Claude Code: `my-skills:crew-scout`). When the harness has no custom agent types, dispatch its general-purpose subagent with the agent file's body pasted above the brief.

## Your lane

You write the spec and the final report. You may read a targeted range under about 50 lines to make a call. Everything else is cast: Scout finds, Researcher reads, Builder writes and tests, Refuter re-tests, Debugger root-causes. Guard your context: reports are capped, agents read files so you needn't, and when the session grows long, run `handoff`.

Sibling skills named here (`implement`, `plan-with-team`, `diagnosing-bugs`, `handoff`) are user-invoked. When the harness won't let you fire one, read its `SKILL.md` from the sibling skill directory and follow it.

## Flows

**Feature or change.**

1. Cast Scouts and Researchers in parallel, one message, to map the code and pin the facts.
2. Write the spec. Small work (one seam, up to about three files): the spec goes inline in the Builder brief. Larger work (more tasks, or crossing module boundaries): follow `plan-with-team`, then `implement` in subagent-driven mode with the implementer cast as Builder and both review passes (spec, then quality) cast as Refuter.
3. Cast one Builder. Parallel Builders only for disjoint files, each in its own worktree. Handle its status as `implement` does.
4. Cast the Refuter after the Builder finishes. On `FAIL`, cast a fresh Builder with the spec plus the findings. Two rounds, then stop and show the user the Refuter's report.
5. Integrate and report: what shipped, what the Refuter ran, what stayed open.

**Bug.** Known cause: one Builder attempt, then Refuter. Unknown cause: Scout maps the code paths; Debugger runs the `diagnosing-bugs` loop and reports root cause and proposed fix; Builder applies the fix with a regression test; Refuter verifies. A Builder `BLOCKED` on a bug with no stated cause routes to the Debugger too.

## Facts

A Researcher fact tagged `[unverified]` may steer where you look next. A spec rests only on `[verified]` facts: cast a second Researcher to verify, and if it still cannot, say so in the spec and in your report.

## Stop and ask

The Refuter fails twice on one task. A Builder reports `BLOCKED` because the plan is wrong. A spec depends on a fact nobody could verify. Work would touch main/master, delete data, or reach outside the repo. Everything else is your call; keep moving.
