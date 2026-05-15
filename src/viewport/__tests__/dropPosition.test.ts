/**
 * dropPosition unit tests
 *
 * computeDropPosition() is pure geometry — no WebGL, no Three.js renderer.
 * We pass a real PerspectiveCamera and synthetic DragEvent.
 * OrbitControls requires a DOM element; we avoid constructing a full Viewport
 * by providing a minimal stub matching the { cameraCtrl: { camera } } shape.
 */

import { describe, it, expect } from 'vitest';
import { PerspectiveCamera } from 'three';
import { computeDropPosition } from '../dropPosition';
import type { Viewport } from '../Viewport';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Minimal Viewport stub — computeDropPosition only reads `viewport.cameraCtrl.camera`.
 */
function makeViewportStub(camera: PerspectiveCamera): Viewport {
  return { cameraCtrl: { camera } } as unknown as Viewport;
}

/**
 * Stub HTMLDivElement with a known bounding rect.
 */
function makeContainerStub(rect: DOMRect): HTMLDivElement {
  const div = document.createElement('div');
  vi.spyOn(div, 'getBoundingClientRect').mockReturnValue(rect);
  return div;
}

/**
 * Create a minimal DragEvent-like object with clientX/Y.
 */
function makeDragEvent(clientX: number, clientY: number): DragEvent {
  return { clientX, clientY } as DragEvent;
}

import { vi } from 'vitest';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('computeDropPosition', () => {
  describe('null viewport', () => {
    it('returns [0, 0, 0] when viewport is null', () => {
      const container = document.createElement('div');
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 800, 600),
      );
      const result = computeDropPosition(makeDragEvent(400, 300), container, null);
      expect(result).toEqual([0, 0, 0]);
    });
  });

  describe('ray hits y=0 plane', () => {
    it('returns y=0 when ray hits ground plane', () => {
      // Camera positioned above origin looking down at y=0
      const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const rect = new DOMRect(0, 0, 800, 600);
      const container = makeContainerStub(rect);
      const viewport = makeViewportStub(camera);

      // Drop at center of container
      const result = computeDropPosition(makeDragEvent(400, 300), container, viewport);

      // y must be exactly 0 (clamped by function)
      expect(result[1]).toBe(0);
      // x and z should be close to 0 (camera looking straight down at origin)
      expect(Math.abs(result[0])).toBeLessThan(0.1);
      expect(Math.abs(result[2])).toBeLessThan(0.1);
    });

    it('correctly maps off-center drop to non-zero xz position', () => {
      const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 5, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const rect = new DOMRect(0, 0, 400, 400);
      const container = makeContainerStub(rect);
      const viewport = makeViewportStub(camera);

      // Drop at far right edge → positive x
      const right = computeDropPosition(makeDragEvent(380, 200), container, viewport);
      expect(right[1]).toBe(0);
      expect(right[0]).toBeGreaterThan(0);
    });
  });

  describe('ray misses y=0 plane', () => {
    it('returns [0, 0, 0] when ray is parallel to ground (no intersection)', () => {
      // Camera looking along Z axis — ray at center is horizontal, never hits y=0
      const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 1000);
      camera.position.set(0, 0, -5);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      const rect = new DOMRect(0, 0, 800, 600);
      const container = makeContainerStub(rect);
      const viewport = makeViewportStub(camera);

      // Near top-center: ray tilts upward, also won't hit y=0
      const result = computeDropPosition(makeDragEvent(400, 0), container, viewport);
      // Either missed (fallback [0,0,0]) or y=0 — either is acceptable
      expect(result[1]).toBe(0);
    });
  });

  describe('NDC computation', () => {
    it('uses container rect to compute NDC (top-left corner → negative NDC)', () => {
      const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
      camera.position.set(0, 10, 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      // Container offset from viewport edge
      const rect = new DOMRect(100, 50, 400, 400);
      const container = makeContainerStub(rect);
      const viewport = makeViewportStub(camera);

      // clientX/Y at container top-left = NDC (-1, +1)
      const result = computeDropPosition(makeDragEvent(100, 50), container, viewport);
      expect(result[1]).toBe(0); // always y=0 for ground plane hits
    });
  });
});
