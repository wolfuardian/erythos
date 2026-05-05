---
description: Wake the context-janitor meta-agent to audit and clean the Claude Code environment.
---

# Run context-janitor

Launch the `context-janitor` subagent.

## Flow

1. Invoke `context-janitor` via Task tool with:
   ```
   Run a full environment audit. Scan .claude/scratch/, ~/.claude/projects/ session logs,
   CLAUDE.md, .claude/decisions/log.md. Use your defined output format.
   ```

2. Show the janitor's report **verbatim** (do not re-summarize — the user needs the full candidate list).

3. Wait for per-section approval.

4. Execute approved actions:
   - Delete → `rm` the named files.
   - Distill → read file → condense to 1–3 lines → append to `.claude/decisions/log.md` (with date) → `rm` original.
   - Disable skill/MCP → instruct the user to edit `.claude/settings.local.json` or `~/.claude.json` manually (we don't touch settings directly).
   - Rewrite CLAUDE.md → show diff, confirm again, then write.

5. After completion, append to `.claude/decisions/log.md`:
   ```
   - YYYY-MM-DD [janitor]: cleared X files, distilled Y lines, observed Z unused components
   ```

## Rules

- Janitor only reports; the **main session** executes destructive actions.
- Every destructive action requires an explicit yes.
- "All yes" must be spoken by the user — never inferred from context.
