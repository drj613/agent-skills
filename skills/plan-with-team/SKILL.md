---
name: plan-with-team
description: "Create an implementation plan another agent can build from without asking questions: explore yourself, design test-first tasks with dependencies, adversarially review the plan, and open a tracker ticket per task."
disable-model-invocation: true
argument-hint: "[requirement] [orchestration hint]"
---

# Plan with team

Produce a plan that is a blueprint, not a sketch: a fresh agent should be able to execute it without asking a single question. Planning only — do not build or modify the codebase.

## Rules

- **Explore the codebase yourself.** No subagents for exploration; the plan's quality is your understanding. The only agent you may dispatch is the adversary in step 4.
- **Test-first by default.** The first task in each seam writes failing tests; later tasks make them pass. The plan carries a `## Test Requirements` section, and a task is not complete until its tests pass.
- **Every task gets a ticket.** The tracker comes from `## Issue tracker` in the repo-root `.agent-harness.md` (run `/setup-harness` if missing). A plan without tickets is incomplete.

## Steps

1. **Understand the requirement.** If none was given, stop and ask. Read any module or architecture docs the repo routes you to before designing.
2. **Explore and design.** Read the code the plan will touch. Tag the work's type (chore | feature | refactor | fix | enhancement) and complexity (simple | medium | complex). Honor any orchestration hint the user gave about team composition or task granularity.
3. **Write the plan** to the repo's plan directory (e.g. `doc/plans/<name>.md`). Each task gets: an ID, a title, dependencies (task IDs), acceptance criteria, an assignee (a named agent type or general-purpose), and a ticket field left `TBD`. Include sections for Solution Approach, Relevant Files, Test Requirements, and Edge Cases & Risks.
4. **Adversarial review.** Dispatch one adversary agent with the plan path and the user's original request. Its job is to find decision gaps: contract mismatches, missing negative paths, unspecified failure modes, ambiguities a builder would have to guess at. It returns findings tagged `critical | important | nice-to-have`.
5. **Incorporate findings.** For each critical/important finding, either add coverage (an acceptance criterion, a test, a new task with dependencies wired in) or record it under Edge Cases & Risks with an explicit accept/defer decision and reason. Never drop one silently. Nice-to-haves may be listed as deferred. Renumber tasks if any were added so IDs stay unique and dependencies resolve. **Open decisions must be zero before the plan ships** — an unresolved decision is a question the builder will have to ask, which defeats the plan.
6. **Create tickets.** One ticket per task via the configured tracker (e.g. `br create` with `br dep add` for dependencies, or `gh issue create`), plan path in each description. Write every returned ticket ID back into the plan's task entries and its ticket index table.
7. **Report:** plan path, topic, complexity, the task list with owners and ticket IDs, and the command to start building.

Keep a record of the adversary's findings and their dispositions in the plan itself — a deferred finding recorded with a reason is a decision; one that only lived in conversation is prose that evaporates.
