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
| `principle-*` (5) | Always-on rules: encode lessons in structure, prove it works, fix root causes, guard the context window, laziness protocol |

Plus the `Comment Sicko` agent (`agents/comment-sicko.md`), spawned by no-comments.

**From [superpowers](https://github.com/obra/superpowers), ported wholesale:**

| Skill | Job |
|---|---|
| `test-driven-development` | Red-green-refactor with the testing-anti-patterns reference |

## Harness portability

These skills are meant to work across harnesses (Claude Code, Cursor, Codex, ...). Everything harness-specific — model slugs, transcript paths, MCP discovery — lives in one repo-root config file, `.agent-harness.md`, written by running `/setup-harness` once per repo. Skills read that file when present and fall back to generic behavior ("strongest models the harness offers") when it's missing. Upstream's Cursor-specific model IDs, `~/.cursor` paths, and `pstack-models.mdc` references were all replaced with this mechanism; reflect's skill-edit handoff points at `writing-for-agents` instead of Cursor's `create-skill`.

Upstream licenses are preserved in `licenses/`.
