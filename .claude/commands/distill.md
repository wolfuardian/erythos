---
description: Distill .claude/scratch/ files into one-line entries in .claude/decisions/log.md, then delete originals.
argument-hint: [optional file glob, defaults to whole scratch]
---

# Distill scratch → log.md

Promote one-shot scratch contents into long-term memory.

## Flow

1. Target list:
   - With `{{args}}` → use that glob.
   - Otherwise → `.claude/scratch/*.md` (excluding `.gitkeep`).

2. For each file:
   - Read content.
   - Distill to **1–3 lines** of conclusion (decisions, not summaries).
   - Show the user:
     ```
     File: .claude/scratch/foo.md
     Distilled:
     - YYYY-MM-DD [tag]: decided X over Y because Z
     ```
   - Wait for: keep / skip / edit.

3. For `keep`:
   - Append to `.claude/decisions/log.md` (format below).
   - Delete the scratch file.

4. For `skip`:
   - Ask: delete original? yes / no.

5. For `edit`:
   - Let user rewrite the line; on confirm → append + delete.

## log.md append format

```markdown
- YYYY-MM-DD [tag]: <one-line conclusion>
```

Examples:
```markdown
- 2026-05-05 [auth]: switched to JWT refresh-token rotation; sliding session raced across devices
- 2026-05-03 [build]: replaced webpack DefinePlugin with import.meta.env
```

## Rules

- Each line must be **self-explanatory** (readable three months from now without the original file).
- Append decisions, not process notes ("we discussed", "considered" → don't write).
- If a scratch file yields no decision, it never should have been kept — skip + delete.
