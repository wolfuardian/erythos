# Decisions Log

> Long-term decisions for the Erythos project. One conclusion per line, **self-explanatory** (readable three months from now without context).
>
> Format: `- YYYY-MM-DD [tag]: <conclusion>`
>
> Rules:
> - Conclusions only — no process notes.
> - One line per decision; if it doesn't fit, split or it's not a decision.
> - Audit / review output without a clear decision: do not append.
>
> Maintenance: `/distill` or `/janitor` append automatically; manual append also OK.

---

- 2026-04 [solid-reactivity]: VectorDrag uses `<Index>` not `<For>` over primitive arrays — `<For>` is keyed by value, so `0.3 → 0.34` unmounts/remounts the child and wipes `onCleanup` listeners (issue #436)
- 2026-04 [solid-reactivity]: three repeated traps in derived UI — `createSignal(expr)` only samples once, `<Show>` children capture once on falsy→truthy switch (use `<Dynamic>` or `keyed`), and preview vs commit state must come from separate sources during interactive drag (issues #547→#553)
- 2026-05-04 [refactor]: splitting heat-map files reduces churn-score by ~half but doesn't relocate the heat — viewport stayed #1 even after `1061 → 643` lines, because it's churn-driven by feature work, not size-driven; future big-file decisions should weigh churn nature (feat-heavy vs fix-heavy) over raw line count
