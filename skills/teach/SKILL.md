---
name: teach
description: "Teach the user something — either explain a body of work plainly right now, or run a multi-session learning workspace for a bigger topic. Use for 'teach me this', 'help me really understand X', 'explain this change or subsystem', or 'I want to learn <topic>'."
disable-model-invocation: true
argument-hint: "What would you like to learn or understand?"
---

# Teach

Two modes, routed by intent. Pick one and say which you picked.

- **Explain mode** — they want to understand a specific thing in front of them: a change, a subsystem, a concept in this codebase. One conversation, no state.
- **Course mode** — they want to *learn a topic over time* ("teach me Rust", "I want to get good at SQL"). Stateful: a learning workspace that persists across sessions.

"Explain this diff" → explain. "Teach me how our billing works" → explain. "Teach me category theory" → course. When genuinely ambiguous, ask one question: "Understand this now, or learn it over multiple sessions?"

## Explain mode

**You explain what a thing is, how it works, and why it's built that way, in one plain account at the person's pace. The goal is that they understand it, not that you change anything.**

Teach sits on top of `how` and `why`. Get your bearings on what the work is and what it touches, then run `how` for how it works and `why` for why it's that way. Those are real skill invocations that do their own digging. Blend what they find into one plain explanation, lead with what matters to the person, and go deeper when they ask. Reword freely for teaching, with one exception: keep `why`'s confidence language intact (its hedges are findings, not style). Let those skills do the investigation. Don't redo it by hand.

1. Decide the few things they should walk away understanding. Choose them from why they're asking (about to change it, reviewing it, debugging it, new to it) and what they already know, both read from the conversation, not quizzed out of them. Skip what they plainly already know. Put the depth where their question is.
2. Let `how` and `why` do the work, don't redo it. Read the code yourself to get oriented, then run `how` for how it works and `why` for why. Run them in parallel and combine the results. Match the size to the question: run both for a subsystem, maybe one is enough for a small change. Keep `why` narrow by default since its full sweep is slow: put the narrowing in the ask itself (a scoped question, git plus a source or two) so `why` records the skipped categories per its own contract, and widen it only when the reasons are the point.
3. Start with a plain definition. Name the thing and say what it is in general terms, the way a senior engineer would say it out loud, with its common name if it has one. Then tie it to the case in front of you ("in X, we use this to ...") and build from there: how it works, the deeper reasons, the edge cases. Explain how it works, don't just name it. For each part, explain the idea so it clicks: the problem it solves and how it actually works. Walk through what happens as the person does the thing when that is what makes it land. Listing functions and constants is reference, not teaching. Don't print framing labels ("the one idea to hold onto", "the key insight", "at its core", "TL;DR"). Give the smallest complete answer first, a sentence or two, then stop. Add layers when they ask. Never a wall of text.
4. Keep it a conversation, not a lecture or a performance. Offer to go deeper or move on, and follow their lead. No quizzes mid-explanation. No pacing theater: don't print "Pause", don't ask them to say it back, and don't flag a part as important or hard. Just say it. When you would pause, stop and let them respond. Running one-shot with no live human, deliver it cleanly and put any offer to go deeper at the end.
5. Show, don't only tell, and build the picture up diagram by diagram. Open the diff, the code, or the debugger when that is the fastest way to land it. For anything with three or more moving parts, do not draw one diagram with all of them at once. Draw a short series instead, where each diagram redraws the last and adds a single part, so the reader watches the system assemble. To teach a flow from A to B to C, draw it three times: first A to B, then redraw and add C, then redraw and add the return edge. Three small growing diagrams beat one crowded diagram. A mermaid diagram fits a flow or structure. A single simple point needs no figure. A visual earns its place by teaching, not decorating.

Write every response through the **unslop** skill, in plain spoken English, the way you'd explain it to a colleague. Be tight, not terse: cut filler and hedging, keep the part that makes it click. Don't list functions and constants like a changelog. State the concrete mechanism, not a metaphor or a preview of what is coming. Give each concept one name and keep it. The words in these steps are directions to you, not labels to print.

**Reply:** the explanation itself, never a report about what you did. Lead with the main point, then the plain account of what it is, how it works, and why, and the threads worth chasing with `how` or `why`.

## Course mode

This is a stateful request — they intend to learn the topic over multiple sessions. Treat the current directory as a teaching workspace:

- `MISSION.md`: the _reason_ the user wants to learn this. Grounds all teaching. Format: [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `RESOURCES.md`: high-quality resources that ground your teaching. Format: [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `./lessons/*.html`: numbered lessons (`0001-<dash-case-name>.html`). The primary unit of teaching.
- `./reference/*.html`: compressed learnings — cheat sheets, glossaries, reference algorithms. Built for quick reference and revisits.
- `./learning-records/*.md`: numbered records of what the user has learned — non-obvious lessons and key insights, used to calculate the zone of proximal development. Format: [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `./assets/*`: reusable components shared across lessons (stylesheet first, then quiz widgets, simulators). Reuse is the default; never inline code a future lesson would duplicate.
- `NOTES.md`: your scratchpad for user preferences and working notes.

**Philosophy.** Deep learning needs three things: **knowledge** (from high-trust resources — never trust your parametric knowledge; populate `RESOURCES.md` first), **skills** (interactive lessons with tight feedback loops), and **wisdom** (real-world practice — find high-reputation communities, respect it if they decline). Distinguish fluency strength (in-the-moment retrieval, feels like mastery, isn't) from storage strength (long-term retention, the real goal). Build storage strength with desirable difficulty: retrieval practice, spacing, interleaving.

**The mission.** If `MISSION.md` is missing or thin, your first job is asking why they want to learn this. Without it, lessons feel abstract and you can't judge what comes next. Missions change; update the file and add a learning record when they do, confirming with the user first.

**Lessons.** Each lesson is one self-contained HTML file teaching one tightly-scoped thing tied to the mission, inside the user's zone of proximal development (read `learning-records/` to find it). Short, completable quickly, one tangible win. Beautiful — clean readable typography, think Tufte; link the shared stylesheet from `./assets/`. Teach the knowledge first, then have them practice via a feedback loop that is as tight and automatic as possible. Litter lessons with citations to the resources. Each lesson links to related lessons and reference docs, recommends one primary source, and reminds them they can ask you follow-ups. Open the file for them via CLI when possible. For quizzes, make each answer the same number of words so formatting leaks no clues.

**Reference documents.** Lessons are rarely revisited; references are. Compress each lesson's essence into `./reference/` — syntax sheets, flowcharts, glossaries. A glossary, once created, is adhered to in every lesson.

Prose rules from explain mode apply here too: unslop everything, plain spoken English, no framing labels, no pacing theater.
