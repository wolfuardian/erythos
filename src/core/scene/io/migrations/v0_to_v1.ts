/**
 * Migration: v0 (current on-disk SceneFile) → v1 (ErythosSceneV1 spec-aligned shape).
 *
 * v0 shape:  { version: 1, nodes: SceneNode[] }  with a `components` bag per node.
 * v1 shape:  { version: 1, env: SceneEnv, nodes: SceneNode[] }  with flat nodeType fields.
 *
 * Both shapes happen to use version: 1 on disk. This is a one-time logical re-classification
 * (pre-spec vs spec-aligned), not a numeric bump. See docs/erythos-format.md § Migration 規則.
 */

import type {
  ErythosSceneV1,
  SceneNode,
  NodeType,
  LightProps,
  CameraProps,
  MaterialOverride,
  HexColor,
  NodeId,
  Vec3,
} from '../types';

import { asNodeUUID } from '../../../../utils/branded';

// ── Color conversion ───────────────────────────────────────────────────────────

/**
 * Converts a Three.js numeric color (e.g. 0xff0000) to a lowercase hex string "#rrggbb".
 * Always emits 6-digit form, zero-padded.
 */
function numberToHex(n: number): HexColor {
  return '#' + Math.floor(n).toString(16).padStart(6, '0');
}

// ── Prefab path stripping ──────────────────────────────────────────────────────

/**
 * Strips the "prefabs/" prefix and ".prefab" suffix from a prefab component path.
 * E.g. "prefabs/chair.prefab" → "chair".
 * Defensive: only strips when present.
 */
function stripPrefabPath(path: string): string {
  let result = path;
  if (result.startsWith('prefabs/')) {
    result = result.slice('prefabs/'.length);
  }
  if (result.endsWith('.prefab')) {
    result = result.slice(0, result.length - '.prefab'.length);
  }
  return result;
}

// ── Node migration ─────────────────────────────────────────────────────────────

/** Shape of a v0 node as parsed from JSON (untyped). */
type V0Node = {
  id: string;
  name: string;
  parent: string | null;
  order: number;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  components: Record<string, unknown>;
  userData?: Record<string, unknown>;
};

function migrateNode(raw: V0Node): SceneNode {
  const components = raw.components;

  // Resolve nodeType + asset/light/camera based on component priority.
  // Priority: mesh > geometry > prefab > light > camera > group (empty/unrecognised).
  let nodeType: NodeType = 'group';
  let asset: string | undefined;
  let light: LightProps | undefined;
  let camera: CameraProps | undefined;

  const meshComp = components['mesh'] as Record<string, unknown> | undefined;
  const geometryComp = components['geometry'] as Record<string, unknown> | undefined;
  const prefabComp = components['prefab'] as Record<string, unknown> | undefined;
  const lightComp = components['light'] as Record<string, unknown> | undefined;
  const cameraComp = components['camera'] as Record<string, unknown> | undefined;

  if (meshComp !== undefined && typeof meshComp['path'] === 'string') {
    nodeType = 'mesh';
    asset = 'assets://' + meshComp['path'];
  } else if (geometryComp !== undefined && typeof geometryComp['type'] === 'string') {
    nodeType = 'mesh';
    asset = 'assets://primitives/' + geometryComp['type'];
  } else if (prefabComp !== undefined && typeof prefabComp['path'] === 'string') {
    nodeType = 'prefab';
    asset = 'prefabs://' + stripPrefabPath(prefabComp['path']);
  } else if (lightComp !== undefined) {
    nodeType = 'light';
    const rawType = typeof lightComp['type'] === 'string' ? lightComp['type'] : 'directional';
    const rawColor = typeof lightComp['color'] === 'number' ? lightComp['color'] : 0xffffff;
    const rawIntensity = typeof lightComp['intensity'] === 'number' ? lightComp['intensity'] : 1;
    light = {
      type: rawType as LightProps['type'],
      color: numberToHex(rawColor),
      intensity: rawIntensity,
    };
  } else if (cameraComp !== undefined) {
    nodeType = 'camera';
    const rawFov = typeof cameraComp['fov'] === 'number' ? cameraComp['fov'] : 75;
    const rawNear = typeof cameraComp['near'] === 'number' ? cameraComp['near'] : 0.1;
    const rawFar = typeof cameraComp['far'] === 'number' ? cameraComp['far'] : 1000;
    camera = {
      type: 'perspective',
      fov: rawFov,
      near: rawNear,
      far: rawFar,
    };
  }
  // else: nodeType stays 'group'

  // Migrate optional material component.
  const matComp = components['material'] as Record<string, unknown> | undefined;
  let mat: MaterialOverride | undefined;
  if (matComp !== undefined) {
    const built: MaterialOverride = {};
    if (typeof matComp['color'] === 'number') built.color = numberToHex(matComp['color']);
    if (typeof matComp['roughness'] === 'number') built.roughness = matComp['roughness'];
    if (typeof matComp['metalness'] === 'number') built.metalness = matComp['metalness'];
    if (typeof matComp['emissive'] === 'number') built.emissive = numberToHex(matComp['emissive']);
    if (typeof matComp['emissiveIntensity'] === 'number') built.emissiveIntensity = matComp['emissiveIntensity'];
    if (typeof matComp['opacity'] === 'number') built.opacity = matComp['opacity'];
    if (typeof matComp['transparent'] === 'boolean') built.transparent = matComp['transparent'];
    if (typeof matComp['wireframe'] === 'boolean') built.wireframe = matComp['wireframe'];
    mat = built;
  }

  const node: SceneNode = {
    id: asNodeUUID(raw.id) as NodeId,
    name: raw.name,
    parent: raw.parent !== null ? asNodeUUID(raw.parent) as NodeId : null,
    order: raw.order,
    nodeType,
    position: raw.position,
    rotation: raw.rotation,
    scale: raw.scale,
    userData: {},
  };

  if (asset !== undefined) node.asset = asset;
  if (mat !== undefined) node.mat = mat;
  if (light !== undefined) node.light = light;
  if (camera !== undefined) node.camera = camera;

  return node;
}

// ── Top-level migration ────────────────────────────────────────────────────────

/**
 * Migrates a v0 SceneFile (raw parsed JSON, unknown shape) to ErythosSceneV1.
 *
 * Takes `unknown` so callers don't need to pre-type the JSON blob.
 */
export function v0_to_v1(raw: unknown): ErythosSceneV1 {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('v0_to_v1: input must be a non-null object');
  }

  const input = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(input['nodes']) ? input['nodes'] : [];

  return {
    version: 1,
    env: {
      hdri: null,
      intensity: 1,
      rotation: 0,
    },
    nodes: rawNodes.map((n) => migrateNode(n as V0Node)),
  };
}
