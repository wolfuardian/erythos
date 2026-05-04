/**
 * useThumbnails — generates 64×64 data-URL thumbnails for prefab assets.
 *
 * Strategy:
 * - One shared offscreen WebGLRenderer (not appended to DOM, preserveDrawingBuffer: true)
 * - Thumbnails cached as Map<assetId, { modified: string; dataURL: string }>
 * - Invalidated when asset.modified changes
 * - Generated lazily on first reactive access (createEffect watches prefabAssets)
 * - Falls back gracefully when mesh sources are missing or render fails
 *
 * P1c: removed GlbStore dependency; mesh URLs come from mesh.url (hydrated at load)
 * or are resolved on-demand via projectManager.urlFor(mesh.path).
 */

import { createSignal, createEffect, onCleanup } from 'solid-js';
import {
  Scene, WebGLRenderer, PerspectiveCamera,
  DirectionalLight, AmbientLight, Box3, Vector3,
  ACESFilmicToneMapping, type Object3D,
} from 'three';
import type { PrefabAsset } from '../../core/scene/PrefabFormat';
import type { Editor } from '../../core/Editor';

const THUMB_SIZE = 64;

interface ThumbEntry {
  modified: string;
  dataURL: string;
}

export function useThumbnails(
  prefabAssets: () => PrefabAsset[],
  editor: Editor,
) {
  // Map<assetId, ThumbEntry>
  const [thumbs, setThumbs] = createSignal<Map<string, ThumbEntry>>(new Map());

  // Shared offscreen renderer — created once, reused for all thumbs
  let renderer: WebGLRenderer | null = null;
  let thumbScene: Scene | null = null;
  let thumbCamera: PerspectiveCamera | null = null;
  let generating = false;

  const getRenderer = (): WebGLRenderer => {
    if (!renderer) {
      renderer = new WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true, // required for toDataURL to work
      });
      renderer.setPixelRatio(1); // fixed 1:1 for offscreen thumbnails
      renderer.setSize(THUMB_SIZE, THUMB_SIZE);
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setClearColor(0x3f3f3f);

      thumbScene = new Scene();
      const ambient = new AmbientLight(0xffffff, 0.4);
      const dirLight = new DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(2, 4, 3);
      thumbScene.add(ambient, dirLight);

      thumbCamera = new PerspectiveCamera(45, 1, 0.001, 1000);
    }
    return renderer;
  };

  const renderThumbnail = async (asset: PrefabAsset): Promise<string | null> => {
    const r = getRenderer();
    if (!thumbScene || !thumbCamera) return null;

    // Collect unique mesh URLs from prefab nodes.
    // P1c: mesh.url is the blob URL (hydrated at scene load).
    // Fallback: if url is absent, resolve via projectManager.urlFor(mesh.path).
    const meshURLs = new Set<string>();
    for (const prefabNode of asset.nodes) {
      const mesh = (prefabNode.components as Record<string, unknown>)?.['mesh'] as
        | { url?: string; path?: string }
        | undefined;
      if (!mesh) continue;
      if (mesh.url) {
        meshURLs.add(mesh.url);
      } else if (mesh.path) {
        try {
          const url = await editor.projectManager.urlFor(mesh.path);
          meshURLs.add(url);
        } catch {
          // soft-fail
        }
      }
    }

    if (meshURLs.size === 0) return null;

    // Temp objects added for this render
    const tempObjects: Object3D[] = [];

    try {
      for (const meshURL of meshURLs) {
        // Ensure GLB is in ResourceCache
        if (!editor.resourceCache.has(meshURL)) {
          try {
            await editor.resourceCache.loadFromURL(meshURL);
          } catch {
            continue;
          }
        }

        const obj = editor.resourceCache.cloneSubtree(meshURL);
        if (!obj) continue;
        tempObjects.push(obj);
        thumbScene.add(obj);
      }

      if (tempObjects.length === 0) return null;

      // Frame camera to fit all objects — same formula as PrefabPanel.autoFrame
      const box = new Box3();
      tempObjects.forEach(obj => box.expandByObject(obj));
      if (box.isEmpty()) return null;

      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3()).length();
      thumbCamera.position.copy(center).add(
        new Vector3(0, size * 0.3, size * 1.2),
      );
      thumbCamera.lookAt(center);
      thumbCamera.near = size * 0.001;
      thumbCamera.far = size * 100;
      thumbCamera.updateProjectionMatrix();

      r.render(thumbScene, thumbCamera);
      return r.domElement.toDataURL('image/png');
    } finally {
      // Always clean up temp objects from scene
      tempObjects.forEach(obj => thumbScene!.remove(obj));
    }
  };

  // Watch prefabAssets and generate missing / stale thumbnails sequentially
  createEffect(() => {
    const assets = prefabAssets();

    // Read current cache snapshot (outside async to capture signal)
    const current = thumbs();

    // Determine which assets need (re-)generation
    const stale = assets.filter(a => {
      const entry = current.get(a.id);
      return !entry || entry.modified !== a.modified;
    });

    if (stale.length === 0 || generating) return;

    // Fire-and-forget sequential generation
    void (async () => {
      generating = true;
      try {
        for (const asset of stale) {
          try {
            const dataURL = await renderThumbnail(asset);
            if (dataURL) {
              setThumbs(prev => {
                const next = new Map(prev);
                next.set(asset.id, { modified: asset.modified, dataURL });
                return next;
              });
            }
          } catch {
            // Silently skip — item will show fallback badge
          }
        }
      } finally {
        generating = false;
      }
    })();
  });

  onCleanup(() => {
    renderer?.dispose();
    renderer = null;
    thumbScene = null;
    thumbCamera = null;
  });

  // Return a stable accessor
  const getThumbnail = (assetId: string): string | null =>
    thumbs().get(assetId)?.dataURL ?? null;

  return { getThumbnail, thumbs };
}
