---
name: handoff
description: "Compact this conversation into a handoff document a fresh agent can pick up cold. Use for 'write a handoff', 'hand this off', 'I'm out of context', 'start a new session on this', or before deliberately dropping the current chat."
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

# Handoff

**You write a document that lets a fresh agent continue this work without reading this chat.** Use for "write a handoff", "hand this off", "I'm out of context", or before starting a clean session on the same work.

This is the mirror of **recall**. Recall reconstructs context by mining transcripts after the fact. Handoff writes that context down while you still have it, which is cheaper and far more accurate. Reach for it when the chat is long, the work is unfinished, and the next step belongs to a new session.

Write it to the OS temp dir (`$TMPDIR` on macOS, `/tmp` on Linux, `%TEMP%` on Windows), named `handoff-<topic>-<date>.md`. Never the workspace — a handoff is scratch, not a deliverable, and it must not land in a commit. Print the full path at the end so the next session can be pointed at it.

1. Take the arguments as the next session's focus, if any were passed. Tailor the whole document to that focus and cut anything it doesn't need. With no arguments, cover the work in flight.
2. Reference, don't duplicate. Specs, plans, ADRs, tickets, commits, PRs, and diffs already hold their content — link them by path, ticket ID, or URL. Copying them in is what makes handoffs stale. Duplicate only the reasoning that exists nowhere but this chat.
3. Verify live state before writing it down. Run `git status`, `git log --oneline -5`, and the branch/PR checks so the "where things stand" section reflects the repo, not your memory of it. Say which tests you actually ran and what they returned; never imply a passing suite you didn't run.
4. Carry the dead ends. What you tried that didn't work, and why, is the highest-value thing in the document — it's the part the next agent cannot rediscover without repeating your mistakes.
5. Redact. No API keys, tokens, passwords, connection strings, or personal data. Sanitize before writing, not after.
6. Write the prose through the **unslop** skill.

## Output contract

- **Goal.** One or two sentences: what the user is trying to achieve.
- **State.** Branch, commits, PRs, tickets, and what's verified vs. merely written. Tag each item the way recall does: `[merged #N]`, `[open PR #N]`, `[in flight <branch>]`, `[verified, uncommitted]`, `[reverted #N]`, `[planned, not started]`.
- **Artifacts.** Paths and URLs to the plan, spec, ADRs, tickets, and key files. Links only.
- **Decisions.** Choices made and the reason, especially ones a fresh agent would otherwise reverse.
- **Dead ends.** Tried, failed, why.
- **Next move.** The single concrete next action, then anything after it.
- **Suggested skills.** Which skills the next agent should invoke, and for what. Name them exactly as the harness lists them (skill names and how to invoke them live in the repo-root `.agent-harness.md` written by `/setup-harness`).

Keep it to something a fresh agent reads in under two minutes. When it grows past that, cut detail, never sections.

**Reply:** the file path, plus the Goal and Next move lines inline so the user can sanity-check the handoff without opening it.
