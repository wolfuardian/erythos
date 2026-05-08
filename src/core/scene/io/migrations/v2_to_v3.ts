/**
 * Migration: v2 (ErythosSceneV2) → v3 (ErythosSceneV3).
 *
 * v2 shape: { version: 2, env: SceneEnv, nodes: SceneNode[] }
 * v3 shape: { version: 3, upAxis: 'Y', env: SceneEnv, nodes: SceneNode[] }
 *
 * The only change is the addition of `upAxis: 'Y'` at the top level.
 *
 * Rationale: Erythos is Y-up + metre-unit (aligns with GLB/glTF spec). This invariant
 * was previously an undocumented viewport convention; v3 writes it into the schema so
 * every .erythos file is self-describing. An absent `upAxis` in a v2 record is silently
 * backfilled here — the value is unambiguous because Erythos has never supported any
 * other axis.
 *
 * See docs/erythos-format.md § v3 Schema / § Migration v2→v3
 * See .claude/編輯器的核心功能設計.md round 8 Q5 (spec drift rationale)
 */

import type { ErythosSceneV3 } from '../types';

/**
 * Migrates an ErythosSceneV2 (raw parsed JSON) to ErythosSceneV3.
 *
 * Takes `unknown` so callers don't need to pre-type the input.
 */
export function v2_to_v3(raw: unknown): ErythosSceneV3 {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('v2_to_v3: input must be a non-null object');
  }

  const input = raw as Record<string, unknown>;

  return {
    version: 3,
    upAxis: 'Y',
    env: input['env'] as ErythosSceneV3['env'],
    nodes: (input['nodes'] ?? []) as ErythosSceneV3['nodes'],
  };
}
