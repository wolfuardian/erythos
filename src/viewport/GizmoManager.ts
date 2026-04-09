import { Vector3, Euler, type Object3D, type Camera } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { TransformMode } from '../core/EventEmitter';

export interface GizmoCallbacks {
  onDragStart?: (object: Object3D) => void;
  onDragEnd?: (object: Object3D, startPos: Vector3, startRot: Euler, startScale: Vector3) => void;
  onDragging?: (isDragging: boolean) => void;
  requestRender: () => void;
}

export class GizmoManager {
  readonly controls: TransformControls;
  private callbacks: GizmoCallbacks;

  private dragStartPosition = new Vector3();
  private dragStartRotation = new Euler();
  private dragStartScale = new Vector3();

  constructor(camera: Camera, domElement: HTMLCanvasElement, callbacks: GizmoCallbacks) {
    this.callbacks = callbacks;
    this.controls = new TransformControls(camera, domElement);

    this.controls.addEventListener('dragging-changed', (event) => {
      const isDragging = event.value as boolean;
      callbacks.onDragging?.(isDragging);

      if (isDragging && this.controls.object) {
        // Capture start values
        this.dragStartPosition.copy(this.controls.object.position);
        this.dragStartRotation.copy(this.controls.object.rotation);
        this.dragStartScale.copy(this.controls.object.scale);
        callbacks.onDragStart?.(this.controls.object);
      } else if (!isDragging && this.controls.object) {
        callbacks.onDragEnd?.(
          this.controls.object,
          this.dragStartPosition.clone(),
          this.dragStartRotation.clone(),
          this.dragStartScale.clone(),
        );
      }
    });

    this.controls.addEventListener('change', () => {
      callbacks.requestRender();
    });
  }

  attach(object: Object3D): void {
    this.controls.attach(object);
    this.callbacks.requestRender();
  }

  detach(): void {
    this.controls.detach();
    this.callbacks.requestRender();
  }

  setMode(mode: TransformMode): void {
    this.controls.setMode(mode);
    this.callbacks.requestRender();
  }

  get object(): Object3D | undefined {
    return this.controls.object;
  }

  dispose(): void {
    this.controls.dispose();
  }
}
