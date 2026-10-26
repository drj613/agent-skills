---
name: recon
description: "Recon how a feature is commonly built before designing it: survey the established approaches against primary sources, then recommend the one that fits this repo. Use before a major feature, a library or vendor choice, a hard-to-reverse design, or work in an unfamiliar domain, and when asked for best practices for building X."
---

# Recon

Before designing a major feature, find out how others have built it, recommend the approach that fits this repo, and stop for the user to pick.

Run recon whenever the user asks for it. Otherwise skip it when the user's chosen approach settles every material design choice, when an existing pattern in the repo covers the whole feature, or when the change is small and touches no data model, wire format, public API, or dependency. Say in one line that you skipped it and why, then carry on with the request.

## Start

Open a todolist with one entry per phase.

1. Frame
2. Candidates
3. Investigate
4. Recommend
5. Stop

## 1. Frame

Write the feature in one sentence, then the constraints every approach has to fit. In Required behavior, Scale, and Stack, mark anything the user would merely like as a `preference`; the rest are hard requirements. Existing patterns, Reversibility, Ruled out, and Out of scope are context that no candidate passes or fails.

- **Required behavior**: what the feature must guarantee: correctness, delivery, consistency, latency, security, privacy.
- **Scale**: the load the feature faces at launch, from evidence in the repo (row counts, traffic, existing limits, plan tier). Project it a year out and mark the projection `assumed`.
- **Stack**: language, framework, hosting, and the dependencies already installed.
- **Existing patterns**: code in this repo that already solves part of the problem, with `path:line`.
- **Reversibility**: what is expensive to change later (data model, wire format, public API, vendor).
- **Ruled out**: approaches the user has already rejected, and why.
- **Out of scope**.

Read the repo and the user's words first. Then ask once, in one message, for any constraint you could not find that would plausibly eliminate an approach, and for approaches the user has already ruled out. Mark the rest `assumed`. With no human reachable (a delegated or unattended run), mark them `assumed` without asking.

Done when each constraint cites its source (`path:line`, a config file, the user's words) or is marked `assumed`.

## 2. Candidates

Run two differently worded web searches: how the feature is commonly built, and what people replaced when building it. With no web search in the harness, say so and mark web-derived facts `unverified`; repo reads keep their `path:line` citations. From those and the repo, list up to five approaches, each a different shape. The list includes, wherever they apply:

- the **simplest viable** approach: the least machinery that meets every cited hard requirement in the frame (an `assumed` one cannot disqualify it);
- the **existing pattern**, when the repo already has one;
- the **buy** option, when a maintained library or managed service covers the feature.

When two of these are the same approach, list it once. A candidate from search cites the URL that led to it. An approach left off the list, because the user ruled it out, a cited hard requirement plainly rules it out, or the list is full, becomes a two-line note marked `not investigated` with the reason; keep the list short rather than pad it.

Done when each candidate has a one-line description, every required entry that applies is on the list, and every approach a source presents as a standard way to build this is either a candidate or a `not investigated` note.

## 3. Investigate

Dispatch one research subagent per candidate, in parallel. Use the `crew-researcher` agent type when the harness has it; otherwise a general-purpose subagent with `crew-researcher`'s body pasted above the brief. When the harness accepts a model at dispatch, use the researcher's slug from `## Crew roles` in the repo-root `.agent-harness.md` when that file exists; otherwise use the harness default. With no subagents, do the same reads yourself, one candidate at a time.

Each brief carries the frame and the candidate, and asks for facts in the researcher's report format covering:

- how the approach works, and whether it meets each required behavior in the frame;
- one mature project that runs it, with a link to the code that implements it, read in this session;
- the libraries or services it depends on: current version, last release date, maintenance signals, license, and open security advisories;
- its failure modes and the scale or condition where each appears. For these, issue threads and postmortems count as primary sources.

For the existing-pattern candidate, the repo code at the cited `path:line` stands in for the mature project, and the brief also asks where that code falls short of the frame and what extending it would touch. For the buy option, the vendor's current docs and one named adopter's write-up stand in for readable code.

Done when every candidate has a report. Re-dispatch a researcher that drops out once; if it fails again, note the gap against its candidate.

## 4. Recommend

Write the findings to a Markdown file unless the user asked for another form. Save it where the repo already keeps design notes or research; with no convention, use `docs/recon/<feature-slug>.md`.

Judge each candidate on fit with the frame, not on general merit. For each, estimate its cost here: the modules it lands in, the dependencies it adds, and the migration it forces, marked `(estimate)`.

The simplest candidate that fails no cited hard requirement wins. `pass` and `unknown` both leave a candidate standing; an `unknown` on a requirement that decides the pick makes the recommendation conditional ("X, unless Y; check Z to settle it"). An `assumed` constraint or a `preference` can rule nothing out; an assumed one goes under open questions as a signal that could flip the pick. When a heavier candidate wins, name the cited requirement the simpler ones fail. When two candidates are equally simple, a cited preference breaks the tie first, then the lower cost estimate; when that is still too close to call, say so under open questions. When every candidate fails a cited requirement, recommend none; the file and the Stop report still follow.

The file holds:

1. **Status**: `proposed`.
2. **Frame**: the feature and its constraints, assumptions marked.
3. **Candidates**: for each, how it works, who runs it, its dependencies (version, last release, maintenance signals, license, open advisories), where it breaks, what it locks in, and its cost estimate, keeping the researchers' `[verified]` and `[unverified]` tags. Then the `not investigated` notes.
4. **Comparison**: one row per candidate, simplest first; one column per hard requirement or preference, labelling the `assumed` and `preference` ones; each cell is `pass`, `fail`, or `unknown` with a few words of reason.
5. **Recommendation**: the pick, conditional when the rules above say so, with the deciding factor (the cited requirement the simpler candidates fail, or simplicity when none does) and the signal that would make you switch to the runner-up. With no pick: the requirement each candidate fails, the one most worth relaxing, and the evidence that would put a candidate back in play.
6. **Open questions**: what the research could not settle, any candidate left without a report, and any unverified claim the recommendation leans on.
7. **Sources**: every link and `path:line` cited.

Done when the file holds all seven sections and every candidate is judged on every column.

## 5. Stop

Report the file path, the recommendation in two or three lines, and the open questions, then end the turn and ask which approach to take, or, with no pick, which requirement to relax. Continue past the pick only when the user's words grant it outright, such as "then build it" or "pick one and go". A request that names the work ("add rate limiting") is a request for recon, and you stop. With no human reachable, return the file path and recommendation as your result.

When the user picks, set the status to `chosen: <candidate> (<date>)` wherever the findings live, before anything else.
