/**
 * EnvironmentSettings — re-exported from SceneFormat.SceneEnv.
 *
 * Pre-v1: EnvironmentSettings had { hdrUrl, intensity, rotation } and lived
 *   separately from SceneDocument in Editor._envSettings.
 * Post-v1: SceneEnv has { hdri, intensity, rotation } and lives in
 *   SceneDocument.env (persisted to disk as part of ErythosSceneV1).
 *
 * This file provides backward compatibility aliases for callers that still
 * import from this path. New code should import SceneEnv from './SceneFormat'.
 */

export type { SceneEnv as EnvironmentSettings } from './SceneFormat';
export { DEFAULT_SCENE_ENV as DEFAULT_ENV_SETTINGS } from './SceneDocument';
