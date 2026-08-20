---
name: setup-harness
description: Run once per repo to write .agent-harness.md — the harness config (models, transcript paths, MCP discovery) that interrogate, arena, architect, and reflect read.
disable-model-invocation: true
---

# Setup harness

These skills are harness-portable (Claude Code, Cursor, Codex, anything with subagents). Everything harness-specific lives in one repo-root file, `.agent-harness.md`. This skill writes it. Skills that need a harness fact read that file; if it's missing, they fall back to generic behavior and suggest running this.

## Steps

1. **Detect the harness.** Check the environment: which agent CLI is running, what its subagent/task tool is called, where it stores session transcripts (e.g. Claude Code: `~/.claude/projects/<project-slug>/*.jsonl`; Cursor: the workspace `agent-transcripts/` directory), and where skills are installed.
2. **Detect available models.** List the model names/slugs the harness's subagent tool accepts. Detect second-vendor CLIs on PATH (`codex`, `gemini`, etc.) — an independent vendor makes adversarial review genuinely diverse.
3. **Propose and confirm.** Show the user a proposed config with recommended answers: reviewer list for interrogate (3–4 entries, at least one second-vendor if available), runner list and cross-judge pool for arena/architect. Wait for confirmation.
4. **Write `.agent-harness.md`** at the repo root using the template below. If the repo is shared, recommend adding it to `.gitignore` (or `.git/info/exclude`) so personal model choices don't land on teammates.

## Template

```markdown
# Agent harness config
Harness: <name>

## Interrogate reviewers
- <model slug or CLI command, one per line>

## Arena runners
- <model slug, one per line>

## Arena cross-judge pool
- <model slugs>

## Transcript location
<glob for the current session's transcript files>

## Skill file locations
<paths where skills are installed for this harness>

## MCP discovery
<how to enumerate available MCP servers in this harness>
```
