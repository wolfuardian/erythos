import {
  Raycaster,
  Vector2,
  type Object3D,
  type Scene,
  type Camera,
} from 'three';

export interface PickerCallbacks {
  onSelect: (object: Object3D | null) => void;
  onHover: (object: Object3D | null) => void;
  resolveTarget?: (object: Object3D) => Object3D;
  requestRender: () => void;
}

export class SelectionPicker {
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private domElement!: HTMLCanvasElement;
  private scene!: Scene;
  private camera!: Camera;
  private callbacks: PickerCallbacks;
  private ignoreObjects: Set<Object3D> = new Set();

  // Click detection
  private pointerDownPos = new Vector2();
  private pointerDownTime = 0;

  private boundDown = this.onPointerDown.bind(this);
  private boundUp = this.onPointerUp.bind(this);
  private boundMove = this.onPointerMove.bind(this);
  private boundLeave = this.onPointerLeave.bind(this);

  constructor(callbacks: PickerCallbacks) {
    this.callbacks = callbacks;
  }

  mount(domElement: HTMLCanvasElement, scene: Scene, camera: Camera): void {
    this.domElement = domElement;
    this.scene = scene;
    this.camera = camera;

    domElement.addEventListener('pointerdown', this.boundDown);
    domElement.addEventListener('pointerup', this.boundUp);
    domElement.addEventListener('pointermove', this.boundMove);
    domElement.addEventListener('pointerleave', this.boundLeave);
  }

  /** Objects to skip during raycasting (e.g., gizmo helpers). */
  addIgnore(obj: Object3D): void {
    this.ignoreObjects.add(obj);
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(): Object3D | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(
      this.scene.children,
      true,
    );

    for (const hit of intersects) {
      let obj: Object3D | null = hit.object;
      // Walk up to find a non-ignored ancestor
      while (obj) {
        if (this.ignoreObjects.has(obj)) { obj = null; break; }
        if (obj.parent === this.scene) break;
        obj = obj.parent;
      }
      if (obj) {
        return this.callbacks.resolveTarget?.(obj) ?? obj;
      }
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointerDownPos.set(e.clientX, e.clientY);
    this.pointerDownTime = performance.now();
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button !== 0) return;
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - this.pointerDownTime;

    // Only count as click if pointer barely moved and within time threshold
    if (dist < 4 && elapsed < 500) {
      this.updatePointer(e);
      const hit = this.pick();
      this.callbacks.onSelect(hit);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    this.updatePointer(e);
    const hit = this.pick();
    this.callbacks.onHover(hit);
  }

  private onPointerLeave(): void {
    this.callbacks.onHover(null);
  }

  dispose(): void {
    this.domElement?.removeEventListener('pointerdown', this.boundDown);
    this.domElement?.removeEventListener('pointerup', this.boundUp);
    this.domElement?.removeEventListener('pointermove', this.boundMove);
    this.domElement?.removeEventListener('pointerleave', this.boundLeave);
  }
}
