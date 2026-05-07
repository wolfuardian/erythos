/**
 * Erythos Scene Format v1 — persistent types.
 *
 * These types define the on-disk shape of `.erythos` files.
 * See docs/erythos-format.md § v1 Schema for the authoritative spec.
 *
 * Runtime types (number colors, branded IDs) live in SceneFormat.ts.
 * The serialise/deserialise boundary in SceneDocument converts between the two.
 */

import type { NodeUUID } from '../../../utils/branded';

// ── Primitives ─────────────────────────────────────────────────────────────────

/** UUIDv4 node identity, branded to prevent cross-domain assignment. */
export type NodeId = NodeUUID;

/**
 * Asset URL — four sanctioned schemes: assets://, prefabs://, materials://, blob://.
 * Plain string alias (not branded — resolver handles scheme dispatch).
 */
export type AssetUrl = string;

/** Persistent hex color string "#RRGGBB". Runtime boundary converts to/from Three.js number. */
export type HexColor = string;

/** [x, y, z] tuple for position / rotation (euler XYZ rad) / scale. */
export type Vec3 = [number, number, number];

// ── Node types ─────────────────────────────────────────────────────────────────

export type NodeType = 'mesh' | 'light' | 'camera' | 'prefab' | 'group';

// ── Component props ────────────────────────────────────────────────────────────

export type LightProps = {
  type: 'directional' | 'ambient' | 'point' | 'spot';
  /** Persistent hex string. Runtime boundary converts to/from Three.js number. */
  color: HexColor;
  intensity: number;
};

export type CameraProps = {
  /** v1 only supports perspective. Orthographic reserved for future version bump. */
  type: 'perspective';
  fov: number;
  near: number;
  far: number;
};

/**
 * Inline material override — only covers deltas from the asset's own material.
 * Per Invariant #7: at most 8 fields (excluding transparent/wireframe); more → extract to materials://.
 */
export type MaterialOverride = {
  color?: HexColor;
  roughness?: number;
  metalness?: number;
  emissive?: HexColor;
  emissiveIntensity?: number;
  opacity?: number;
  /** Three.js rendering requirement: must be true when opacity < 1. */
  transparent?: boolean;
  /** Debug rendering mode. */
  wireframe?: boolean;
};

// ── Scene node ─────────────────────────────────────────────────────────────────

export type SceneNode = {
  id: NodeId;
  name: string;
  /** null = root node. */
  parent: NodeId | null;
  /** Sibling sort order (integer). */
  order: number;
  /** Determines which optional fields (asset / light / camera) are meaningful. */
  nodeType: NodeType;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Required for mesh and prefab nodeTypes; absent for light / camera / group. */
  asset?: AssetUrl;
  /** Optional material override; only valid on mesh / prefab. */
  mat?: MaterialOverride;
  /** Required for light nodeType only. */
  light?: LightProps;
  /** Required for camera nodeType only. */
  camera?: CameraProps;
  /** Reserved — v1 mandates empty {}. Not for application state. */
  userData?: Record<string, unknown>;
};

// ── Environment ────────────────────────────────────────────────────────────────

export type SceneEnv = {
  /** HDRI asset URL, or null for no environment map. */
  hdri: AssetUrl | null;
  /** Environment map intensity, 0..N. */
  intensity: number;
  /** Environment map rotation in radians. */
  rotation: number;
};

// ── Top-level scene file ───────────────────────────────────────────────────────

export type ErythosSceneV1 = {
  version: 1;
  env: SceneEnv;
  nodes: SceneNode[];
};
