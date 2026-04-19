import { Raycaster, Plane, Vector3, Vector2 } from 'three';
import type { Vec3 } from '../core/scene/SceneFormat';
import type { Viewport } from './Viewport';

/**
 * 由 DragEvent 位置計算 y=0 平面上的 3D 落點。
 * 若 viewport 為 null 或 ray 未打中平面，回傳 [0, 0, 0]。
 */
export function computeDropPosition(
  e: DragEvent,
  containerRef: HTMLDivElement,
  viewport: Viewport | null,
): Vec3 {
  const rect = containerRef.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  if (!viewport) return [0, 0, 0];

  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), viewport.cameraCtrl.camera);
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const hitPoint = new Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, hitPoint);

  if (hit) {
    return [hitPoint.x, 0, hitPoint.z];
  }
  return [0, 0, 0];
}
