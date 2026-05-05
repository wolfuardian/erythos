---
description: Generic audit command. Forces subagent execution; no file lands in main session.
argument-hint: <thing to audit, e.g. error handling in src/auth>
---

# Audit (subagent mode)

Process the user's audit request via this strict flow:

## Flow

1. Launch a subagent (general-purpose) for the actual audit.
2. Subagent instructions:
   - Task: `{{args}}`
   - **Do not write any file** (no audit-*.md, report-*.md, anything).
   - If intermediate notes are needed, write to `.claude/scratch/` and delete before reporting.
   - Reply format: max 300-word summary + max 5 concrete recommendations.
3. Main session shows the summary verbatim.
4. Ask the user: "Append this summary to `.claude/decisions/log.md`?"
   - yes → distill to 1–3 lines and append.
   - no → done, nothing persisted.

## Why

- Audits are exploratory; they touch many files.
- Those tokens shouldn't pollute the main session.
- 99% of audit conclusions are read-once; persistence is a liability.
- The 1% that's worth keeping fits in one line in the log.

## Rules

- Do NOT read `{{args}}`-related files in the main session. First action: launch the subagent.
- Main session must not write `audit-*.md`.
- Don't ask the user "save as file?" — the default is no.
