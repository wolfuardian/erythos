# Erythos Error Code Taxonomy

Error codes provide stable, machine-readable identifiers alongside human-readable
messages. Every user-facing error should carry both.

## Naming convention

```
E<NNNN> ERR_SCREAMING_SNAKE
```

- `E` prefix, 4-digit decimal number, one space, then `ERR_` + SCREAMING_SNAKE name
- Example: `E1004 ERR_SCENE_INVARIANT`
- The number is stable — never reuse a retired number
- The `ERR_` name should be descriptive enough to grep without looking up docs

## Numeric segment allocation

| Range         | Domain                          | Notes                        |
|---------------|---------------------------------|------------------------------|
| E1001–E1099   | Scene I/O (UUID, quota)         | E1001/E1002/E1003 occupied   |
| E1100–E1199   | Sync / conflict                 | E1101 occupied               |
| E1200–E1299   | Asset                           | Reserved for #1047           |
| E1300–E1399   | Auth / session                  |                              |
| E1400–E1499   | IO / file system                |                              |

## Current registry

| Code                           | Location                                           | Description                              |
|--------------------------------|----------------------------------------------------|------------------------------------------|
| `E1001 ERR_USER_ID_FORMAT`     | `server/src/middleware/validate-uuid.ts` (server)  | User path param is not a valid UUID      |
| `E1002 ERR_SCENE_ID_FORMAT`    | `server/src/middleware/validate-uuid.ts` (server)  | Scene path param is not a valid UUID     |
| `E1003 ERR_SCENE_QUOTA_EXCEEDED` | `server/src/routes/scenes.ts` (server)           | Free plan 3-scene limit exceeded         |
| `E1004 ERR_SCENE_INVARIANT`    | `src/core/errors/codes.ts` → `SceneInvariantError` | Scene shape violated one or more invariants |
| `E1101 ERR_SCENE_PAYLOAD_TOO_LARGE` | `src/core/errors/codes.ts` → `PayloadTooLargeError` | Scene body exceeds 1 MB server limit |

## Wire envelope formats

**Server responses** (HTTP error body):

```json
{ "error": "<human-readable message>", "code": "E1003 ERR_SCENE_QUOTA_EXCEEDED" }
```

**Client display** — use `formatErrorMessage()` from `src/core/errors/codes.ts`:

```ts
import { formatErrorMessage } from '../errors/codes';

// Produces: "Scene shape invalid (E1004 ERR_SCENE_INVARIANT)"
const msg = formatErrorMessage(err.code, 'Scene shape invalid');
```

Pattern established in `src/app/App.tsx` (PR #1046/#1048):

```ts
body.code ? `${body.error} (${body.code})` : body.error
```

## Adding a new error code

1. Pick the segment whose domain matches (see table above)
2. Choose the next free number in that segment
3. Add a `export const ERR_FOO = 'E#### ERR_FOO' as const` line to `src/core/errors/codes.ts`
4. Add the constant as a `readonly code` field to your error class (or use it inline)
5. Add a row to the registry table in this file
6. If the code is thrown server-side only, note "server" in the Location column — do **not** cross-import `server/` from root workspace

## Scope note

This taxonomy was established in v0.4 polish (#1025). The initial migration covers
`SceneInvariantError` (E1004) and `PayloadTooLargeError` (E1101) as reference
implementations. Other existing error classes are **not** retrofitted in bulk —
add codes incrementally as each class gains a user-facing display path.
