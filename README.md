# agent-skills

A personally curated Claude Code plugin. Skills vendored (copied, not depended on) from three MIT-licensed sources, graded against my own session history and lightly adapted. Replaces the superpowers plugin.

## Skills

**From [mattpocock/skills](https://github.com/mattpocock/skills):**

| Skill | Job |
|---|---|
| `grilling` | Relentless plan interview: design tree, frontier rounds, recommended answers |
| `grill-me` | Slash-command alias for grilling |
| `grill-with-docs` | Grilling + ADRs and glossary written as decisions land |
| `domain-modeling` | The glossary/ADR discipline grill-with-docs depends on |
| `writing-for-agents` | How to write skills and CLAUDE.md files that get reached |
| `loop-me` | Turn recurring loops into delegable workflow specs |
| `diagnosing-bugs` | Loop-first debugging: build a tight red-capable repro before hypothesizing |
| `to-spec` | Turn the current conversation into a tracker spec with test seams |
| `to-tickets` | Break a spec into tracer-bullet tickets with blocking edges |
| `implement` | Execute a spec or tickets — direct, or subagent-driven with two-stage review (blended with superpowers' subagent-driven-development) |
| `codebase-design` | The module/interface/depth/seam vocabulary and principles |
| `improve-codebase-architecture` | Find shallow modules and leaky seams, propose deepenings |
| `wayfinder` | Long-horizon work as a tracker-backed map with a frontier |
| `wizard` | Guided multi-step CLI flows from a template |
| `prototype` | Throwaway UI/logic prototypes to de-risk a design |
| `triage` | Label and route incoming issues with canonical roles |
| `resolving-merge-conflicts` | Rebase-first conflict resolution |
| `teach` | Combined pocock+pstack: explain mode (via how/why) or multi-session course workspace |
| `writing-fragments` | Capture noticings as raw writing material |
| `writing-shape` | Find the shape of a piece before drafting |
| `writing-beats` | Beat-by-beat drafting discipline |
| `research` | AFK research tickets: resolve a fact a decision waits on |

**From [cursor/plugins → pstack](https://github.com/cursor/plugins/tree/main/pstack):**

| Skill | Job |
|---|---|
| `unslop` | Cut AI tells from any writing; always applies |
| `interrogate` | Multi-model adversarial review |
| `architect` | Types, signatures, and module shapes before code; multi-candidate via arena |
| `arena` | N parallel candidates, pick a base, graft the best of the losers |
| `no-comments` | Spawn Comment Sicko, delete comments, encode claimed constraints as checks |
| `why` | Cited design-rationale digs across git, tracker, Slack, docs |
| `how` | Explorer/explainer/critic subsystem walkthroughs |
| `reflect` | Review the live transcript, route lessons into skill edits |
| `blast-radius` | Find what a diff could break beyond the diff; prove safety by running code |
| `swarm` | Fan out N parallel workers, drain them, return one report |
| `technical-writing` | Plain, dense technical prose rules |
| `recall` | Mine your own session transcripts for working context |
| `show-me-your-work` | Append-only decision log audited against the transcript |
| `create-verification-skill` | Generate a project-local skill that drives the real app and captures evidence |
| `maintain-verification-skill` | Keep that verification skill honest as the app evolves |
| `principle-*` (5) | Always-on rules: encode lessons in structure, prove it works, fix root causes, guard the context window, laziness protocol |

Plus the `Comment Sicko` agent (`agents/comment-sicko.md`), spawned by no-comments.

**From [superpowers](https://github.com/obra/superpowers), ported wholesale:**

| Skill | Job |
|---|---|
| `test-driven-development` | Red-green-refactor with the testing-anti-patterns reference |
| `receiving-code-review` | Rigor over performative agreement when handling review feedback |

**Own (ideas codified from my adjentic plugin):**

| Skill | Job |
|---|---|
| `setup-harness` | Run once per repo: writes `.agent-harness.md` (models, tracker, transcript paths) |
| `team-review` | Parallel domain-specialist review with code-validated findings, judge dedup, and a fix/defer/dismiss loop |
| `plan-with-team` | Blueprint-grade plans: test-first tasks, adversarial review, a tracker ticket per task |

## Prerequisites

None hard. Clone, install as a plugin, and run `/setup-harness` once per repo — it detects the harness, proposes model rosters, and checks optional tooling idempotently. The one tool worth having: **beads** (`br`, an agent-first issue tracker) powers `to-tickets`, `plan-with-team`, `wayfinder`, and `triage` at their best; `/setup-harness` offers to install it if missing, and everything falls back to GitHub Issues or local markdown without it.

## Harness portability

These skills are meant to work across harnesses (Claude Code, Cursor, Codex, ...). Everything harness-specific — model slugs, issue tracker, review panel, transcript and skill-directory paths, MCP discovery — lives in one repo-root config file, `.agent-harness.md`, written by running `/setup-harness` once per repo. Skills read that file when present and fall back to generic behavior ("strongest models the harness offers") when it's missing. Upstream's Cursor-specific model IDs, `~/.cursor` paths, and `pstack-models.mdc` references were all replaced with this mechanism; reflect's skill-edit handoff points at `writing-for-agents` instead of Cursor's `create-skill`.

Upstream licenses are preserved in `licenses/`.
