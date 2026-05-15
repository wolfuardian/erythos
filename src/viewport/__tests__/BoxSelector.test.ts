/**
 * BoxSelector unit tests
 *
 * Pure event-driven logic — no WebGL renderer involved.
 * Three.js Vector3.project() is pure JS matrix math; jsdom provides the DOM.
 *
 * Strategy: mount on a stub div, dispatch synthetic PointerEvents, check callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scene, Camera, PerspectiveCamera, Object3D, Vector3 } from 'three';
import { BoxSelector, type BoxSelectorCallbacks } from '../BoxSelector';

// ── Constants (matches production source) ─────────────────────────────────────

const DRAG_THRESHOLD = 4; // px

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCallbacks(): BoxSelectorCallbacks & { [K in keyof BoxSelectorCallbacks]: ReturnType<typeof vi.fn> } {
  return {
    onBoxSelect:    vi.fn(),
    onBoxHover:     vi.fn(),
    onBoxDragStart: vi.fn(),
    onBoxDragEnd:   vi.fn(),
    requestRender:  vi.fn(),
  };
}

function makeScene(): Scene {
  return new Scene();
}

function makeCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(60, 1, 0.1, 1000);
  cam.position.set(0, 0, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  return cam;
}

/**
 * Mount BoxSelector on a container with a known 400×400 bounding rect.
 */
function mountSelector(
  selector: BoxSelector,
  scene: Scene,
  camera: Camera,
): HTMLDivElement {
  const container = document.createElement('div');
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 400),
  );
  selector.mount(container, scene, camera);
  return container;
}

/**
 * Dispatch a PointerEvent on an element with clientX/Y.
 */
function pointer(type: string, x: number, y: number, extra: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y, ...extra });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BoxSelector', () => {
  let selector: BoxSelector;
  let callbacks: ReturnType<typeof makeCallbacks>;
  let container: HTMLDivElement;
  let scene: Scene;
  let camera: PerspectiveCamera;

  beforeEach(() => {
    callbacks = makeCallbacks();
    selector  = new BoxSelector(callbacks);
    scene     = makeScene();
    camera    = makeCamera();
    container = mountSelector(selector, scene, camera);
  });

  describe('constructor + mount', () => {
    it('does not fire any callbacks on mount', () => {
      for (const fn of Object.values(callbacks)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  });

  describe('drag threshold', () => {
    it('does NOT fire onBoxDragStart below threshold', () => {
      container.dispatchEvent(pointer('pointerdown', 100, 100));
      // Move only 3px — below DRAG_THRESHOLD (4)
      container.dispatchEvent(pointer('pointermove', 103, 100));
      expect(callbacks.onBoxDragStart).not.toHaveBeenCalled();
    });

    it('fires onBoxDragStart once threshold is crossed', () => {
      container.dispatchEvent(pointer('pointerdown', 100, 100));
      container.dispatchEvent(pointer('pointermove', 100 + DRAG_THRESHOLD, 100));
      expect(callbacks.onBoxDragStart).toHaveBeenCalledTimes(1);
    });

    it('fires onBoxDragStart only once even with multiple moves', () => {
      container.dispatchEvent(pointer('pointerdown', 100, 100));
      container.dispatchEvent(pointer('pointermove', 110, 100));
      container.dispatchEvent(pointer('pointermove', 120, 100));
      container.dispatchEvent(pointer('pointermove', 130, 100));
      expect(callbacks.onBoxDragStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('pointerup without drag', () => {
    it('does not fire onBoxSelect when drag never activated', () => {
      container.dispatchEvent(pointer('pointerdown', 100, 100));
      container.dispatchEvent(pointer('pointerup', 101, 100)); // tiny move, no threshold
      expect(callbacks.onBoxSelect).not.toHaveBeenCalled();
    });
  });

  describe('full drag cycle', () => {
    it('fires onBoxDragEnd and onBoxSelect on pointerup after active drag', () => {
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200)); // crosses threshold
      container.dispatchEvent(pointer('pointerup', 200, 200));

      expect(callbacks.onBoxDragEnd).toHaveBeenCalledTimes(1);
      expect(callbacks.onBoxSelect).toHaveBeenCalledTimes(1);
    });

    it('passes ctrl modifier from pointerup event', () => {
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(pointer('pointerup', 200, 200, { ctrlKey: true }));

      const [, modifier] = callbacks.onBoxSelect.mock.calls[0] as [Object3D[], { ctrl: boolean }];
      expect(modifier.ctrl).toBe(true);
    });

    it('ctrl is false when no modifier key held', () => {
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(pointer('pointerup', 200, 200));

      const [, modifier] = callbacks.onBoxSelect.mock.calls[0] as [Object3D[], { ctrl: boolean }];
      expect(modifier.ctrl).toBe(false);
    });

    it('resets state after pointerup — second drag works independently', () => {
      // First drag
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(pointer('pointerup', 200, 200));

      // Second drag
      container.dispatchEvent(pointer('pointerdown', 10, 10));
      container.dispatchEvent(pointer('pointermove', 100, 100));
      container.dispatchEvent(pointer('pointerup', 100, 100));

      expect(callbacks.onBoxDragStart).toHaveBeenCalledTimes(2);
      expect(callbacks.onBoxSelect).toHaveBeenCalledTimes(2);
    });
  });

  describe('setEnabled(false)', () => {
    it('ignores pointerdown when disabled', () => {
      selector.setEnabled(false);
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(pointer('pointerup', 200, 200));
      expect(callbacks.onBoxDragStart).not.toHaveBeenCalled();
      expect(callbacks.onBoxSelect).not.toHaveBeenCalled();
    });

    it('re-enables correctly after setEnabled(true)', () => {
      selector.setEnabled(false);
      selector.setEnabled(true);
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(pointer('pointerup', 200, 200));
      expect(callbacks.onBoxSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('addIgnore', () => {
    it('ignores added objects in hit collection', () => {
      const obj = new Object3D();
      // Place at world origin — projects near center
      obj.position.set(0, 0, 0);
      scene.add(obj);
      selector.addIgnore(obj);

      // Select entire 400×400 area
      container.dispatchEvent(pointer('pointerdown', 0, 0));
      container.dispatchEvent(pointer('pointermove', 400, 400));
      container.dispatchEvent(pointer('pointerup', 400, 400));

      const [hits] = callbacks.onBoxSelect.mock.calls[0] as [Object3D[]];
      expect(hits).not.toContain(obj);
    });
  });

  describe('dispose', () => {
    it('stops responding to events after dispose', () => {
      selector.dispose();
      container.dispatchEvent(pointer('pointerdown', 50, 50));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(pointer('pointerup', 200, 200));
      expect(callbacks.onBoxSelect).not.toHaveBeenCalled();
    });
  });

  describe('non-primary button', () => {
    it('ignores right-click (button=2) pointerdown', () => {
      container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, clientX: 50, clientY: 50 }));
      container.dispatchEvent(pointer('pointermove', 200, 200));
      container.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, clientX: 200, clientY: 200 }));
      expect(callbacks.onBoxDragStart).not.toHaveBeenCalled();
    });
  });
});
