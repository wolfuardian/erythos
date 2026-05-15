/**
 * SceneInvariants — structural correctness checks for ErythosSceneV1.
 *
 * Implements the 10 in-scope invariants from:
 *   docs/erythos-format.md § Invariants (line 140-153)
 *   docs/erythos-format.md § 機械驗收清單 (line 259-274)
 *
 * Note: DAG cycle detection (invariant #6) is out of scope for this issue
 * and handled by the parallel Phase 3-B issue (#821).
 *
 * Architecture:
 *   - validateScene(): pure function, returns violations (never throws).
 *   - Callers (SceneDocument.deserialize, AutoSave) throw on non-empty violations.
 *   - UnsupportedVersionError: version gate run on raw JSON before migration.
 *   - SceneInvariantError: thrown after validation on migrated v1 scene.
 *
 * Invariant 10 — "no prefab subtree expanded":
 *   We use the structural proxy: a nodeType:'prefab' node must have no children
 *   in the same nodes[] array. Expanded subtrees are the forbidden case — a baked
 *   prefab child would appear as parent === prefabNodeId. Runtime hydration is
 *   never written to disk, so this structural check captures real violations.
 */

import { z } from 'zod';

// ── CURRENT_VERSION ─────────────────────────────────────────────────────────

/**
 * Maximum supported schema version. Files with version > CURRENT_VERSION are
 * rejected with UnsupportedVersionError (spec line 227-230).
 *
 * v4 (refs #1027): introduces primitives:// scheme for built-in geometry,
 * migrating from the synthetic project://primitives/<type> pattern.
 */
export const CURRENT_VERSION = 4;

// ── Zod schema for ErythosSceneV1 ───────────────────────────────────────────

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #rrggbb');

const LightTypeSchema = z.enum(['directional', 'ambient', 'point', 'spot']);

const LightPropsSchema = z.object({
  type: LightTypeSchema,
  color: HexColorSchema,
  intensity: z.number(),
});

const CameraPropsSchema = z.object({
  type: z.literal('perspective'),
  fov: z.number(),
  near: z.number(),
  far: z.number(),
});

const MaterialOverrideSchema = z.object({
  color: HexColorSchema.optional(),
  roughness: z.number().optional(),
  metalness: z.number().optional(),
  emissive: HexColorSchema.optional(),
  emissiveIntensity: z.number().optional(),
  opacity: z.number().optional(),
  transparent: z.boolean().optional(),
  wireframe: z.boolean().optional(),
});

const NodeTypeSchema = z.enum(['mesh', 'light', 'camera', 'prefab', 'group']);

const SceneNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  parent: z.string().nullable(),
  order: z.number().int(),
  nodeType: NodeTypeSchema,
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema,
  asset: z.string().optional(),
  mat: MaterialOverrideSchema.optional(),
  light: LightPropsSchema.optional(),
  camera: CameraPropsSchema.optional(),
  userData: z.record(z.string(), z.unknown()).optional(),
});

const SceneEnvSchema = z.object({
  hdri: z.string().nullable(),
  intensity: z.number(),
  rotation: z.number(),
});

export const ErythosSceneV1Schema = z.object({
  version: z.literal(1),
  env: SceneEnvSchema,
  nodes: z.array(SceneNodeSchema),
});

/**
 * Zod schema for ErythosSceneV2.
 * Shape is identical to V1 schema except for the version literal.
 * Kept for reference / legacy fixture tests; runtime validation uses V3.
 */
export const ErythosSceneV2Schema = z.object({
  version: z.literal(2),
  env: SceneEnvSchema,
  nodes: z.array(SceneNodeSchema),
});

/**
 * Zod schema for ErythosSceneV3.
 * Adds the required `upAxis: 'Y'` invariant field.
 * Kept for reference / legacy fixture tests; runtime validation uses V4.
 *
 * upAxis must be the literal string 'Y'. Any other value (including missing)
 * is a schema violation — treated as corrupt data, not a migration target.
 */
export const ErythosSceneV3Schema = z.object({
  version: z.literal(3),
  upAxis: z.literal('Y'),
  env: SceneEnvSchema,
  nodes: z.array(SceneNodeSchema),
});

/**
 * Zod schema for ErythosSceneV4.
 * Introduces primitives:// scheme for built-in geometry (refs #1027).
 * Shape is identical to v3 except version literal.
 * Used by validateScene() after the full migration chain v0→v1→v2→v3→v4 runs.
 */
export const ErythosSceneV4Schema = z.object({
  version: z.literal(4),
  upAxis: z.literal('Y'),
  env: SceneEnvSchema,
  nodes: z.array(SceneNodeSchema),
});

// ── Violation + Error types ──────────────────────────────────────────────────

/**
 * A single invariant violation with a specific path and human-readable reason.
 */
export interface InvariantViolation {
  /** JSONPath-style pointer to the offending value, e.g. "nodes[2].asset" */
  path: string;
  /** Human-readable sentence describing the violation. */
  reason: string;
}

/**
 * Thrown when a .erythos file's version is newer than CURRENT_VERSION.
 * Message format matches spec line 227-230.
 */
export class UnsupportedVersionError extends Error {
  constructor(public readonly fileVersion: number) {
    super(
      `這個檔案是用較新版本的 Erythos 建立的(格式 v${fileVersion}),` +
      `你的版本只支援到 v${CURRENT_VERSION}。請更新 Erythos。`,
    );
    this.name = 'UnsupportedVersionError';
  }
}

/**
 * Thrown when validateScene() returns one or more violations.
 * Contains the full list for structured error handling / display.
 */
export class SceneInvariantError extends Error {
  constructor(public readonly violations: InvariantViolation[]) {
    const summary = violations
      .map(v => `  [${v.path}] ${v.reason}`)
      .join('\n');
    super(`Scene invariant violations:\n${summary}`);
    this.name = 'SceneInvariantError';
  }
}

// ── Version gate (runs on raw JSON before migration) ─────────────────────────

/**
 * Validates the raw (un-migrated) version field of a parsed JSON object.
 *
 * Order required by architecture:
 *   1. checkRawVersion(raw) — reject future/invalid version
 *   2. v0_to_v1(raw) → ErythosSceneV1
 *   3. validateScene(scene) — structural invariants
 *
 * @throws UnsupportedVersionError if version > CURRENT_VERSION
 * @throws TypeError if raw is not an object or version is not a positive integer
 */
export function checkRawVersion(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('checkRawVersion: input must be a non-null object');
  }
  const input = raw as Record<string, unknown>;
  const version = input['version'];

  if (typeof version !== 'number' || !Number.isInteger(version) || version <= 0) {
    throw new SceneInvariantError([
      {
        path: 'version',
        reason: `version must be a positive integer, got ${JSON.stringify(version)}`,
      },
    ]);
  }

  if (version > CURRENT_VERSION) {
    throw new UnsupportedVersionError(version);
  }
}

/**
 * Pre-migration guard for the upAxis invariant on raw v3/v4 inputs.
 *
 * The migration chain (v2_to_v3) hardcodes `upAxis: 'Y'` for backfill, which
 * means a corrupt v3 input with `upAxis: 'Z'` would otherwise be silently
 * rewritten to 'Y' before Zod sees it. This guard runs after checkRawVersion
 * but before the migration chain, preserving the spec invariant:
 *
 *   docs/erythos-format.md Invariant #11 — upAxis must be 'Y'; deserialize
 *   throws SceneInvariantError when reading any other value.
 *
 * Applies to v3 and v4 inputs (both have the upAxis field). v0/v1/v2 schemas
 * have no `upAxis` field; the migration chain ignores any stray field on those versions.
 *
 * @throws SceneInvariantError if version >= 3 and upAxis is present and not 'Y'.
 */
export function checkRawUpAxis(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return; // checkRawVersion handles
  const input = raw as Record<string, unknown>;
  const version = input['version'];
  if (
    (version === 3 || version === 4) &&
    input['upAxis'] !== undefined &&
    input['upAxis'] !== 'Y'
  ) {
    throw new SceneInvariantError([
      {
        path: 'upAxis',
        reason: `upAxis must be 'Y'; received ${JSON.stringify(input['upAxis'])}`,
      },
    ]);
  }
}

// ── Core invariant validator ──────────────────────────────────────────────────

/**
 * Validates an already-migrated ErythosSceneV4 against the in-scope invariants.
 *
 * Pure function — accumulates violations, never throws.
 * Callers should throw SceneInvariantError when violations.length > 0.
 *
 * Out-of-scope (handled by Phase 3-B #821):
 *   - DAG cycle detection (spec invariant #6)
 *   - Broken AssetUrl resolution (spec 機械驗收清單: 404 → warning, not fail)
 *
 * @param scene  A migrated ErythosSceneV4 (version already checked by checkRawVersion,
 *               full migration chain v0→v1→v2→v3→v4 already applied).
 * @param serializedJson  The JSON string of the scene (used for file-size check).
 *                        Pass undefined to skip the size check (e.g. in unit tests).
 */
export function validateScene(
  scene: unknown,
  serializedJson?: string,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  // ── Invariant 1: file size ≤ 1MB ──────────────────────────────────────────
  if (serializedJson !== undefined) {
    const byteLength = new TextEncoder().encode(serializedJson).byteLength;
    if (byteLength > 1_048_576) {
      violations.push({
        path: '(file)',
        reason: `檔案大小 ${byteLength} bytes 超過上限 1MB (1048576 bytes)`,
      });
    }
  }

  // ── Invariant 3 (pre-Zod): no inline geometry fields ─────────────────────
  // Must run BEFORE Zod because Zod's strip mode removes unknown keys.
  const INLINE_GEOMETRY_KEYS_PRE = ['geometry', 'vertices', 'positions', 'indices', 'uvs'] as const;
  if (typeof scene === 'object' && scene !== null) {
    const rawNodes = (scene as Record<string, unknown>)['nodes'];
    if (Array.isArray(rawNodes)) {
      for (let i = 0; i < rawNodes.length; i++) {
        const node = rawNodes[i] as Record<string, unknown>;
        if (typeof node !== 'object' || node === null) continue;
        for (const key of INLINE_GEOMETRY_KEYS_PRE) {
          if (key in node) {
            violations.push({
              path: `nodes[${i}].${key}`,
              reason: `禁止使用內嵌 geometry 欄位 "${key}"，請改用 asset URL (project:// / assets://)。`,
            });
          }
        }
      }
    }
  }

  // ── Invariant 2: Zod schema validate ─────────────────────────────────────
  const zodResult = ErythosSceneV4Schema.safeParse(scene);
  if (!zodResult.success) {
    for (const issue of zodResult.error.issues) {
      violations.push({
        path: issue.path.length > 0
          ? issue.path
              .map((p, i) =>
                typeof p === 'number'
                  ? `[${p}]`
                  : i === 0
                  ? String(p)
                  : `.${String(p)}`,
              )
              .join('')
          : '(root)',
        reason: issue.message,
      });
    }
    // Shape doesn't conform — remaining checks would fail on bad types; bail early.
    return violations;
  }

  const v4 = zodResult.data;

  // Build id lookup set for O(1) parent checks.
  const idSet = new Set<string>(v4.nodes.map(n => n.id));
  // Build set of ids that are parents of some node (for invariant 10).
  const parentIdSet = new Set<string>();
  for (const n of v4.nodes) {
    if (n.parent !== null) parentIdSet.add(n.parent);
  }

  // ── Invariant 4: node.parent → existing id or null ───────────────────────
  for (let i = 0; i < v4.nodes.length; i++) {
    const n = v4.nodes[i];
    if (n.parent !== null && !idSet.has(n.parent)) {
      violations.push({
        path: `nodes[${i}].parent`,
        reason: `節點 "${n.name}" (id: ${n.id}) 的 parent "${n.parent}" 不存在於同一檔案中。`,
      });
    }
  }

  // ── Invariant 5: nodes[].id globally unique ───────────────────────────────
  {
    const seen = new Map<string, number>();
    for (let i = 0; i < v4.nodes.length; i++) {
      const id = v4.nodes[i].id;
      if (seen.has(id)) {
        violations.push({
          path: `nodes[${i}].id`,
          reason: `id "${id}" 重複 (首次出現於 nodes[${seen.get(id)}])。`,
        });
      } else {
        seen.set(id, i);
      }
    }
  }

  // ── Invariant 7: materialOverride field count ≤ 8 (excl. transparent/wireframe) ──
  const MAT_EXCLUDED = new Set(['transparent', 'wireframe']);
  for (let i = 0; i < v4.nodes.length; i++) {
    const mat = v4.nodes[i].mat;
    if (mat === undefined) continue;
    const countableFields = Object.keys(mat).filter(k => !MAT_EXCLUDED.has(k));
    if (countableFields.length > 8) {
      violations.push({
        path: `nodes[${i}].mat`,
        reason: `MaterialOverride 有 ${countableFields.length} 個欄位（不含 transparent/wireframe，上限 8）。請抽離至 materials://。`,
      });
    }
  }

  // ── Invariant 8: nodeType vs auxiliary fields consistency ─────────────────
  for (let i = 0; i < v4.nodes.length; i++) {
    const n = v4.nodes[i];
    switch (n.nodeType) {
      case 'mesh':
      case 'prefab':
        if (n.asset === undefined) {
          violations.push({
            path: `nodes[${i}].asset`,
            reason: `節點 "${n.name}" 的 nodeType "${n.nodeType}" 必須包含 asset 欄位。`,
          });
        }
        if (n.light !== undefined) {
          violations.push({
            path: `nodes[${i}].light`,
            reason: `nodeType "${n.nodeType}" 不得包含 light 欄位。`,
          });
        }
        if (n.camera !== undefined) {
          violations.push({
            path: `nodes[${i}].camera`,
            reason: `nodeType "${n.nodeType}" 不得包含 camera 欄位。`,
          });
        }
        break;
      case 'light':
        if (n.light === undefined) {
          violations.push({
            path: `nodes[${i}].light`,
            reason: `節點 "${n.name}" 的 nodeType "light" 必須包含 light 欄位。`,
          });
        }
        if (n.asset !== undefined) {
          violations.push({
            path: `nodes[${i}].asset`,
            reason: `nodeType "light" 不得包含 asset 欄位。`,
          });
        }
        if (n.camera !== undefined) {
          violations.push({
            path: `nodes[${i}].camera`,
            reason: `nodeType "light" 不得包含 camera 欄位。`,
          });
        }
        break;
      case 'camera':
        if (n.camera === undefined) {
          violations.push({
            path: `nodes[${i}].camera`,
            reason: `節點 "${n.name}" 的 nodeType "camera" 必須包含 camera 欄位。`,
          });
        }
        if (n.asset !== undefined) {
          violations.push({
            path: `nodes[${i}].asset`,
            reason: `nodeType "camera" 不得包含 asset 欄位。`,
          });
        }
        if (n.light !== undefined) {
          violations.push({
            path: `nodes[${i}].light`,
            reason: `nodeType "camera" 不得包含 light 欄位。`,
          });
        }
        break;
      case 'group':
        if (n.asset !== undefined) {
          violations.push({
            path: `nodes[${i}].asset`,
            reason: `nodeType "group" 不得包含 asset 欄位。`,
          });
        }
        if (n.light !== undefined) {
          violations.push({
            path: `nodes[${i}].light`,
            reason: `nodeType "group" 不得包含 light 欄位。`,
          });
        }
        if (n.camera !== undefined) {
          violations.push({
            path: `nodes[${i}].camera`,
            reason: `nodeType "group" 不得包含 camera 欄位。`,
          });
        }
        break;
    }
  }

  // ── Invariant 9: userData must be empty {} ────────────────────────────────
  for (let i = 0; i < v4.nodes.length; i++) {
    const ud = v4.nodes[i].userData;
    if (ud !== undefined && Object.keys(ud).length > 0) {
      violations.push({
        path: `nodes[${i}].userData`,
        reason: `userData 必須為空 {}，v1 禁止寫入 userData (keys: ${Object.keys(ud).join(', ')})。`,
      });
    }
  }

  // ── Invariant 10: no prefab subtree expansion ─────────────────────────────
  // Structural proxy: a nodeType:'prefab' node must have no children in nodes[].
  // If any other node has parent === prefabNodeId, a subtree has been expanded.
  for (let i = 0; i < v4.nodes.length; i++) {
    const n = v4.nodes[i];
    if (n.nodeType === 'prefab' && parentIdSet.has(n.id)) {
      violations.push({
        path: `nodes[${i}]`,
        reason: `prefab 節點 "${n.name}" (id: ${n.id}) 含有子節點。prefab 僅作為參照，不得展開子樹。`,
      });
    }
  }

  return violations;
}
