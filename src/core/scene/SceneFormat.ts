export type Vec3 = [number, number, number];

export interface SceneNode {
  id: string;          // UUID v4
  name: string;
  parent: string | null; // parent UUID
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
  url?: string;
  /** Project-relative path, e.g. "models/chair.glb" — persisted */
  path: string;
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

export interface PrefabComponent {
  id: string; // 對應 PrefabAsset.id，標記此節點為某 prefab 的實例根
}

export interface SceneFile {
  version: number;
  nodes: SceneNode[];
}
