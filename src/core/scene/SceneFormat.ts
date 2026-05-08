/**
 * Runtime (in-memory) types for the Erythos scene model.
 *
 * These are the types used by SceneDocument, Commands, SceneSync, and Panels.
 * They differ from the persistence types in io/types.ts in one key way:
 *   - Colors are `number` (0xffffff) at runtime, `HexColor` ("#ffffff") on disk.
 *
 * Conversion boundary: SceneDocument.serialize() / deserialize()
 * - serialize: number → hex (#rrggbb)
 * - deserialize: v0_to_v1(raw) gives HexColor strings → hex→number converts them
 *
 * See docs/erythos-format.md § "Color 表面型 vs Runtime 型"
 */

import type { NodeUUID } from '../../utils/branded';

export type Vec3 = [number, number, number];

export type NodeType = 'mesh' | 'light' | 'camera' | 'prefab' | 'group';

/**
 * Runtime material override — colors are numbers (0xffffff) matching Three.js.
 * Persistence layer converts to/from HexColor strings.
 */
export interface MaterialOverride {
  color?: number;           // runtime: number (0xffffff)
  roughness?: number;
  metalness?: number;
  emissive?: number;        // runtime: number
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  wireframe?: boolean;
}

/**
 * Runtime light props — color is a number (0xffffff).
 */
export interface LightProps {
  type: 'directional' | 'ambient' | 'point' | 'spot';
  color: number;            // runtime: number (0xffffff)
  intensity: number;
}

export interface CameraProps {
  type: 'perspective';
  fov: number;
  near: number;
  far: number;
}

/**
 * Runtime scene node — flat v1 nodeType shape.
 * No components bag; nodeType determines which optional fields are present.
 */
export interface SceneNode {
  id: NodeUUID;
  name: string;
  parent: NodeUUID | null;
  order: number;
  nodeType: NodeType;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Required for mesh and prefab nodeTypes; absent for light / camera / group. */
  asset?: string;           // AssetUrl: project:// assets:// prefabs:// blob:// materials://
  /** Optional material override; only valid on mesh / prefab. */
  mat?: MaterialOverride;
  /** Required for light nodeType only. */
  light?: LightProps;
  /** Required for camera nodeType only. */
  camera?: CameraProps;
  /** v1 mandates empty {}. Not for application state. */
  userData?: Record<string, unknown>;
}

/**
 * Runtime environment settings — matches SceneEnv from io/types.ts but
 * lives in the runtime layer. hdri is a resolved blob URL at runtime,
 * but we store the AssetUrl (assets:// etc.) for serialization.
 */
export interface SceneEnv {
  /** Asset URL (project://, assets://, blob://, or null for no environment). */
  hdri: string | null;
  intensity: number;
  rotation: number;
}
