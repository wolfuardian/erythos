import { Vector3, type Object3D, type Scene, type Camera } from 'three';

export interface BoxSelectorCallbacks {
  onBoxSelect: (objects: Object3D[], modifier: { ctrl: boolean }) => void;
  onBoxHover: (objects: Object3D[]) => void;
  onBoxDragStart: () => void;
  onBoxDragEnd: () => void;
  requestRender: () => void;
}

const DRAG_THRESHOLD = 4;

export class BoxSelector {
  private container!: HTMLElement;
  private scene!: Scene;
  private camera!: Camera;
  private callbacks: BoxSelectorCallbacks;
  private ignoreObjects: Set<Object3D> = new Set();
  private enabled = true;

  // Drag state
  private pointerDown = false;
  private isActive = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;

  // Overlay element
  private overlay: HTMLDivElement | null = null;

  private boundDown = this.onPointerDown.bind(this);
  private boundMove = this.onPointerMove.bind(this);
  private boundUp = this.onPointerUp.bind(this);

  constructor(callbacks: BoxSelectorCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement, scene: Scene, camera: Camera): void {
    this.container = container;
    this.scene = scene;
    this.camera = camera;

    container.addEventListener('pointerdown', this.boundDown);
    container.addEventListener('pointermove', this.boundMove);
    container.addEventListener('pointerup', this.boundUp);
  }

  addIgnore(obj: Object3D): void {
    this.ignoreObjects.add(obj);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  dispose(): void {
    this.cancel();
    this.container?.removeEventListener('pointerdown', this.boundDown);
    this.container?.removeEventListener('pointermove', this.boundMove);
    this.container?.removeEventListener('pointerup', this.boundUp);
  }

  // ── Event handlers ──────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.enabled) return;
    const rect = this.container.getBoundingClientRect();
    this.startX = e.clientX - rect.left;
    this.startY = e.clientY - rect.top;
    this.currentX = this.startX;
    this.currentY = this.startY;
    this.pointerDown = true;
    this.isActive = false;
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.pointerDown || !this.enabled) return;

    const rect = this.container.getBoundingClientRect();
    this.currentX = e.clientX - rect.left;
    this.currentY = e.clientY - rect.top;

    if (!this.isActive) {
      const dx = this.currentX - this.startX;
      const dy = this.currentY - this.startY;
      if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
        this.isActive = true;
        this.callbacks.onBoxDragStart();
        this.createOverlay();
      }
    }

    if (this.isActive) {
      this.updateOverlay();
      const hits = this.collectHits(rect.width, rect.height);
      this.callbacks.onBoxHover(hits);
      this.callbacks.requestRender();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.button !== 0 || !this.pointerDown) return;
    this.pointerDown = false;

    if (this.isActive) {
      this.isActive = false;
      this.callbacks.onBoxDragEnd();
      const rect = this.container.getBoundingClientRect();
      this.currentX = e.clientX - rect.left;
      this.currentY = e.clientY - rect.top;

      const hits = this.collectHits(rect.width, rect.height);
      this.removeOverlay();
      this.callbacks.onBoxHover([]);
      this.callbacks.onBoxSelect(hits, { ctrl: e.ctrlKey || e.metaKey });
    }
  }

  // ── Hit testing ─────────────────────────────────────

  private collectHits(width: number, height: number): Object3D[] {
    const minX = Math.min(this.startX, this.currentX);
    const maxX = Math.max(this.startX, this.currentX);
    const minY = Math.min(this.startY, this.currentY);
    const maxY = Math.max(this.startY, this.currentY);

    const hits: Object3D[] = [];
    const projected = new Vector3();

    for (const child of this.scene.children) {
      if (this.ignoreObjects.has(child)) continue;

      child.getWorldPosition(projected);
      projected.project(this.camera);

      // Skip objects behind the camera
      if (projected.z > 1) continue;

      const sx = (projected.x + 1) / 2 * width;
      const sy = (1 - projected.y) / 2 * height;

      if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
        hits.push(child);
      }
    }

    return hits;
  }

  // ── Overlay ─────────────────────────────────────────

  private createOverlay(): void {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'absolute',
      border: '1px solid rgba(82, 127, 200, 0.8)',
      backgroundColor: 'rgba(82, 127, 200, 0.15)',
      pointerEvents: 'none',
      zIndex: '5',
    });
    this.container.appendChild(this.overlay);
  }

  private updateOverlay(): void {
    if (!this.overlay) return;
    const left = Math.min(this.startX, this.currentX);
    const top = Math.min(this.startY, this.currentY);
    const w = Math.abs(this.currentX - this.startX);
    const h = Math.abs(this.currentY - this.startY);

    Object.assign(this.overlay.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }

  private removeOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private cancel(): void {
    this.pointerDown = false;
    this.isActive = false;
    this.callbacks.onBoxDragEnd();
    this.removeOverlay();
    this.callbacks.onBoxHover([]);
  }
}
