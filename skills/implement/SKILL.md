---
name: implement
description: "Implement a piece of work based on a spec or set of tickets — directly for small coupled work, or subagent-driven (fresh implementer per task, two-stage review) for plans with independent tasks."
disable-model-invocation: true
---

# Implement

Implement the work described by the user in the spec or tickets.

Two modes. Pick based on the shape of the work and say which you picked:

- **Direct mode** — small work, or tightly coupled tasks where splitting context would hurt. You implement it yourself.
- **Subagent-driven mode** — a plan or ticket set with mostly independent tasks. Fresh subagent per task, two-stage review after each.

Both modes: use the test-driven-development skill where possible, at pre-agreed seams. Run typechecking regularly, single test files regularly, and the full test suite once at the end. Commit to the current branch. Never start on main/master without explicit user consent. Once done, use the interrogate skill to review the work.

## Direct mode

Work through the spec or tickets in dependency order. TDD at the agreed seams, commit as each task lands.

## Subagent-driven mode

Fresh subagent per task + two-stage review (spec compliance first, then code quality). Subagents get isolated, precisely curated context — they never inherit your session history, and you preserve your own context for coordination.

**Execution mode:** Every implementer, spec reviewer, code-quality reviewer, and fix agent in this workflow MUST be dispatched with `run_in_background: false`. Wait for that foreground result before taking the next workflow step. Never use a background completion notification as the sequencing mechanism for this skill, and never dispatch a replacement while the original agent is running or queued.

**Setup:** Read the plan or tickets once. Extract every task with its full text and enough scene-setting context. Track them in a todo list. Never make a subagent read the plan file — provide the full task text in the dispatch.

**Per task:**

1. Dispatch an implementer subagent using [implementer-prompt.md](./implementer-prompt.md). If it asks questions, answer completely before letting it proceed.
2. Implementer implements, tests, commits, self-reviews.
3. Dispatch a spec compliance reviewer using [spec-reviewer-prompt.md](./spec-reviewer-prompt.md). It checks the code matches the spec — nothing missing, nothing extra. Issues found → implementer fixes → re-review. Don't accept "close enough".
4. Only after spec compliance passes, dispatch a code quality reviewer using [code-quality-reviewer-prompt.md](./code-quality-reviewer-prompt.md). Issues found → implementer fixes → re-review.
5. Mark the task complete. Next task.

**After all tasks:** run the interrogate skill over the entire implementation.

**Model selection** — use the least powerful model that handles each role (slugs from `.agent-harness.md` if configured, else the harness's tiers):
- Task touches 1–2 files with a complete spec → fast, cheap model. Most tasks in a well-specified plan are this.
- Multi-file integration, pattern matching, debugging → standard model.
- Design judgment, broad codebase understanding, review → the strongest model available.

**Implementer statuses:**
- `DONE` → proceed to spec review.
- `DONE_WITH_CONCERNS` → read the concerns first. Correctness or scope concerns get addressed before review; observations get noted.
- `NEEDS_CONTEXT` → provide the missing context, re-dispatch.
- `BLOCKED` → diagnose: missing context → re-dispatch with more; needs more reasoning → re-dispatch on a stronger model; task too large → split it; plan is wrong → escalate to the human. Never force the same model to retry unchanged.

**Never:**
- Skip either review stage, or run quality review before spec compliance passes.
- Move to the next task while a review has open issues.
- Dispatch multiple implementer subagents in parallel (conflicts).
- Dispatch any implementer or reviewer in the background, or retry a task that already has an active/queued agent.
- Fix a subagent's failed work by hand — dispatch a fix subagent with specific instructions instead (context pollution).
- Let implementer self-review replace actual review; both are needed.
