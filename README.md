# agent-skills

A personally curated set of AI tooling — skills, agents, and Pi extensions — that I copy across machines. Mostly a Claude Code plugin, but harness-portable: model IDs, tracker paths, and tooling live in `.agent-harness.md`, so the skills run in Claude Code, Cursor, Codex, Pi, and friends. When a commit mentions Pi packages or extensions, those live in `.pi/` and are installed globally on each machine (see [Pi extensions](#pi-extensions)).

## Pi extensions

Two third-party Pi extensions I keep installed everywhere, plus one bundled in this repo. The one-command setup — copies `skills/` and `agents/` into Pi's global dirs, installs `background-task-runner`, and ensures the npm packages — is:

```bash
bash pi-install.sh
```

It is idempotent (safe to re-run). For other harnesses (opencode, commandcode, codex, cursor), copy `skills/` and `agents/` to that harness's skill/agent dirs, or run its `/setup-harness` flow.

Manually, the pieces are:

- **`@tintinweb/pi-subagents`** — Claude Code-style autonomous sub-agents for Pi: parallel background agents, live widget, custom agent types, mid-run steering, resume, worktree isolation. Install with `pi install npm:@tintinweb/pi-subagents`.
- **`@plannotator/pi-extension`** — visual plan review with annotations: file-based plan mode, a browser approval/deny UI for plans, code/PR review, and agent-message annotation. Install with `pi install npm:@plannotator/pi-extension`.

**`background-task-runner`** is a pure shell-task backgrounding extension I wrote from [ismailsaleekh/pi-background-tasks](https://github.com/ismailsaleekh/pi-background-tasks) (ISC), keeping only the background shell jobs and dropping the delegated agents, multi-model Fusion, and Anthropic attribution. Source lives in `.pi/background-task-runner/`. It exposes the `bg_run`, `bg_status`, `bg_logs`, `bg_kill` tools plus `/bg`, `/jobs`, `/logs`, `/kill`, `/bg-clear` commands, a footer status showing running/finished counts, and a completion notification on terminal state. Output lands in `.pi/tasks/`.

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
| `handoff` | Compact the current chat into a handoff doc for a fresh session (pairs with `recall`) |

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
| `crew` | Session mode: orchestrate on the top tier, cast scout/research/build/refute/debug to tiered subagents (`agents/crew-*.md`) |

## Prerequisites

None hard. Clone, install as a plugin, and run `/setup-harness` once per repo — it detects the harness, proposes model rosters, and checks optional tooling idempotently. The one tool worth having: **beads** (`br`, an agent-first issue tracker) powers `to-tickets`, `plan-with-team`, `wayfinder`, and `triage` at their best; `/setup-harness` offers to install it if missing, and everything falls back to GitHub Issues or local markdown without it.

## Harness portability

These skills are meant to work across harnesses (Claude Code, Cursor, Codex, ...). Everything harness-specific — model slugs, issue tracker, review panel, transcript and skill-directory paths, MCP discovery — lives in one repo-root config file, `.agent-harness.md`, written by running `/setup-harness` once per repo. Skills read that file when present and fall back to generic behavior ("strongest models the harness offers") when it's missing. Upstream's Cursor-specific model IDs, `~/.cursor` paths, and `pstack-models.mdc` references were all replaced with this mechanism; reflect's skill-edit handoff points at `writing-for-agents` instead of Cursor's `create-skill`.

Upstream licenses are preserved in `licenses/`. The `background-task-runner` Pi extension is a trimmed port of [pi-background-tasks](https://github.com/ismailsaleekh/pi-background-tasks) (ISC); its license is preserved in `licenses/LICENSE-pi-background-tasks`.
