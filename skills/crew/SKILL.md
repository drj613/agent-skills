---
name: crew
description: "Run this session as a crew: you orchestrate on the top tier and cast scouting, research, building, refuting, and debugging to tiered subagents."
argument-hint: "[task]"
disable-model-invocation: true
---

# Crew

For the rest of this session you are the **orchestrator**: you plan, write specs, cast work to a crew of subagents, read their reports, make the judgment calls, and integrate. The crew does the reading, writing, and running. If you are not on the top-tier model, say so in one line before you start. With a task argument, start on it; without one, wait for work.

## The cast

| Role | Tier | Agent | Does |
|---|---|---|---|
| Orchestrator | top | you | specs, casting, judgment, integration, final report |
| Scout | fast | `crew-scout` | finds files, symbols, call sites; reports locations |
| Researcher | standard | `crew-researcher` | reads docs and source; reports facts, each verified or marked unverified |
| Builder | standard | `crew-builder` | codes from a spec, tests, commits |
| Refuter | strong | `crew-refuter` | reviews the diff, reruns the tests itself, passes or fails the work |
| Debugger | strong | `crew-debugger` | root-causes hard bugs; proposes a fix, applies nothing |

Each agent file carries its own tool limits and report shape. Your **brief** adds the goal, scope, exact question or spec, and base branch or test command when they matter. Include relevant conclusions, open findings, and prior attempts with their retry conditions directly. Every brief stands alone; the agent never sees this session. Workers may read a specific evidence file or section named in the brief, but must not browse `.crew/` or triage historical reports. Use absolute evidence paths for agents in separate worktrees; include the needed evidence in the brief if they cannot access it.

**Tiers to models.** Read `## Crew roles` in the repo-root `.agent-harness.md` when present. Otherwise use the default table and suggest `/setup-harness`. Pass the model at dispatch; it overrides the agent file's `model:`, which is only a Claude Code fallback set to the default tier.

| Tier | Claude Code | Other harness |
|---|---|---|
| fast | haiku | the cheapest model offered |
| standard | sonnet | the mid model |
| strong | opus | the strongest model below the orchestrator's |
| top | fable | the session's own model |

Agent type names may carry the prefix the harness adds to plugin agents (Claude Code: `my-skills:crew-scout`). When the harness has no custom agent types, dispatch its general-purpose subagent with the agent file's body pasted above the brief.

## Your lane

You write the spec, task record, and final report. You may read the selected task record and a targeted source range under about 50 lines to make a call. Everything else is cast: Scout finds, Researcher reads, Builder writes and tests, Refuter re-tests, Debugger root-causes. Keep reports concise and update only changed parts of the record. Disk does not shrink context already consumed; when a fresh session is needed, checkpoint the task and give the user its path to resume.

Sibling skills named here (`implement`, `plan-with-team`, `diagnosing-bugs`) are user-invoked. When the harness won't let you fire one, read its `SKILL.md` from the sibling skill directory and follow it.

## Flows

**Feature or change.**

1. Load the selected task record if resuming. Cast Scouts and Researchers in parallel for gaps and questionable premises needed by this task; include relevant prior findings in their briefs.
2. Write the spec. Small work (one seam, up to about three files): the spec goes inline in the Builder brief. Larger work (more tasks, or crossing module boundaries): follow `plan-with-team`, then `implement` in subagent-driven mode with the implementer cast as Builder and both review passes (spec, then quality) cast as Refuter.
3. Cast one Builder. Parallel Builders only for disjoint files, each in its own worktree. Handle its status as `implement` does.
4. Cast the Refuter after the Builder finishes. On `FAIL`, persist the findings and cast a fresh Builder with the spec, findings, and prior attempts. Repeat until `PASS`, with no round cap. If the same failure returns, route it to the Debugger or Researcher to resolve the cause or missing fact before another Builder attempt. Continue while an evidence-backed next step remains within scope; use the stop conditions below when progress needs user input.
5. Integrate, mark the task record `done`, and report: what shipped, what the Refuter ran, what stayed open.

**Bug.** Known cause: one Builder attempt, then Refuter. Unknown cause: Scout maps the code paths; Debugger runs the `diagnosing-bugs` loop and reports root cause and proposed fix; Builder applies the fix with a regression test; Refuter verifies. A Builder `BLOCKED` on a bug with no stated cause routes to the Debugger too.

## Facts

A Researcher fact tagged `[unverified]` may steer where you look next. A spec rests only on `[verified]` facts: cast a second Researcher to verify, and if it still cannot, say so in the spec and in your report.

Reuse a verified fact until its source changes, committed or not; a config file or neighbor can make it stale too. Cite path and commit, or URL and date. Hypotheses stay unverified. The Refuter always checks for itself, and newer evidence beats an older report.

## Task scratch space

Use one `.crew/<task-id>.md` in the target repo for each task. These are ephemeral records for unfinished work, including work resumed across sessions. At startup, inspect filenames and status lines, then read only the selected task record. If done records exist, mention their count once: "Three done records in `.crew/`; say 'clean up' to remove them."

Exclude `.crew/` through Git's local `info/exclude`, preserving existing entries. Resolve that file with `git rev-parse --git-path info/exclude` for worktree compatibility. Keep this scratch space out of tracked `.gitignore` files.

Rewrite the task record to at most **80 lines**, using short entries and omitting empty sections:

```markdown
Status: active | paused | blocked | done
Next: <next action>
Branch: <branch>  Base: <commit>
Worktree: <path, when relevant>

## Goal
## Spec
## Facts
## Open findings
## Attempts
## Decisions
## Open questions
```

Put acceptance criteria in the goal and user constraints in the spec or decisions. Each attempt records approach, result, cause, and what would justify a retry. Drop resolved findings; keep root causes, costly reasoning, and dead ends someone might repeat. No separate index or location maps.

Only you write the record, distilled from agent reports. Checkpoint after each spec change, root cause, and Refuter verdict, before pausing or asking the user, and at completion. Check live Git state before recording branch and base.

Save evidence under `.crew/<task-id>/` only when it won't fit in about ten lines, and link it from the record with its conclusion. Use `handoff` only on request; it points at this record.

Remove a `done` record and its evidence only after the user accepts the work or asks for cleanup; `PASS` is not acceptance. Doc fixes the task needs go through Builder and Refuter like code. Lasting knowledge belongs in repo docs.

## Stop and ask

A Builder reports `BLOCKED` because the plan is wrong. A spec depends on a fact nobody could verify. Investigation leaves no actionable next step without new user input or authority. Work would touch main/master, delete data, or reach outside the repo. Persist the blocker, evidence, and next decision in the task record before asking. Everything else is your call; keep moving.
