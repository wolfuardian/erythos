import type { AssetPath, BlobURL, NodeUUID } from '../../utils/branded';

export type Vec3 = [number, number, number];

export interface SceneNode {
  id: NodeUUID;        // UUID v4
  name: string;
  parent: NodeUUID | null; // parent UUID
  order: number;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  components: Record<string, unknown>;
  userData: Record<string, unknown>;
}

/**
 * MeshComponent — runtime shape includes `url` (blob URL for loading),
 * `path` (project-relative canonical path, persisted), and optional `nodePath`.
 *
 * Serialised form omits `url` — it is recomputed via projectManager.urlFor(path) at hydrate.
 * `url` is optional because hydrate may soft-fail (file not found → warn + skip).
 */
export interface MeshComponent {
  /** Blob URL used by ResourceCache.loadFromURL — populated at hydrate time, not persisted */
  url?: BlobURL;
  /** Project-relative path, e.g. "models/chair.glb" — persisted */
  path: AssetPath;
  /** Optional sub-tree path within the GLTF, e.g. "Body|Arm" — persisted */
  nodePath?: string;
}

export interface GeometryComponent {
  type: 'box' | 'sphere' | 'plane' | 'cylinder';
}

export interface MaterialComponent {
  color: number;
}

export interface LightComponent {
  type: 'directional' | 'ambient';
  color: number;
  intensity: number;
}

export interface CameraComponent {
  type: 'perspective';
  fov: number;
  near: number;
  far: number;
}

/**
 * PrefabComponent — runtime shape includes `url` (session-scoped blob URL) and
 * `path` (project-relative canonical path, persisted).
 *
 * Serialised form omits `url` — it is recomputed via projectManager.urlFor(path) at hydrate.
 * `url` is optional because hydrate may soft-fail (file not found → warn + skip).
 *
 * Legacy format: `{ id: "<uuid>" }` — migrated to `{ path }` in migrateNodeComponents.
 */
export interface PrefabComponent {
  /** Blob URL used by PrefabRegistry.loadFromURL — populated at hydrate time, not persisted */
  url?: BlobURL;
  /** Project-relative path, e.g. "prefabs/chair.prefab" — persisted */
  path: AssetPath;
}

export interface SceneFile {
  version: number;
  nodes: SceneNode[];
}
