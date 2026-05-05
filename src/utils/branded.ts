/**
 * Branded ID types — domain-typed strings.
 *
 * TypeScript is structural; `type Foo = string` is interchangeable with `string`.
 * The `& { __brand }` phantom intersection makes the type structurally distinct,
 * so the compiler refuses cross-domain assignment without an explicit mint call.
 *
 * Phantom field is erased at runtime — branded values are plain strings; zero overhead.
 *
 * Mint functions (`asNodeUUID`, etc.) are the **only** sanctioned entry point.
 * They are intentionally trivial casts — review concentrates on mint call sites,
 * not every use site.
 */

/** Three.js / SceneNode UUID v4 — scene graph node identity. */
export type NodeUUID = string & { readonly __brand: 'NodeUUID' };
export const asNodeUUID = (s: string): NodeUUID => s as NodeUUID;

/** Prefab asset identifier — independent namespace from NodeUUID (PrefabFormat.id). */
export type PrefabId = string & { readonly __brand: 'PrefabId' };
export const asPrefabId = (s: string): PrefabId => s as PrefabId;

/** Project-relative canonical path — persisted form (e.g. "models/chair.glb"). */
export type AssetPath = string & { readonly __brand: 'AssetPath' };
export const asAssetPath = (s: string): AssetPath => s as AssetPath;

/** Runtime blob URL from URL.createObjectURL — session-scoped, must NOT be persisted. */
export type BlobURL = string & { readonly __brand: 'BlobURL' };
export const asBlobURL = (s: string): BlobURL => s as BlobURL;
