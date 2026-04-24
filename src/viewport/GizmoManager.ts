import { Vector3, Euler, Box3, Quaternion, Object3D, type Camera } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { TransformMode } from '../core/EventEmitter';

export interface GizmoCallbacks {
  onDragStart?: (object: Object3D) => void;
  onDragEnd?: (object: Object3D, startPos: Vector3, startRot: Euler, startScale: Vector3) => void;
  onMultiDragEnd?: (objects: Object3D[], startTransforms: { pos: Vector3; rot: Euler; scale: Vector3 }[]) => void;
  onDragging?: (isDragging: boolean) => void;
  requestRender: () => void;
}

export class GizmoManager {
  readonly controls: TransformControls;
  private callbacks: GizmoCallbacks;

  private dragStartPosition = new Vector3();
  private dragStartRotation = new Euler();
  private dragStartScale = new Vector3();

  // Multi-object state
  private multiObjects: Object3D[] = [];
  private multiStartTransforms: { pos: Vector3; rot: Euler; scale: Vector3 }[] = [];
  private pivot: Object3D | null = null;
  private pivotStartPosition = new Vector3();
  private pivotStartRotation = new Euler();
  private pivotStartScale = new Vector3(1, 1, 1);
  private isMultiDragging = false;

  constructor(camera: Camera, domElement: HTMLCanvasElement, callbacks: GizmoCallbacks) {
    this.callbacks = callbacks;
    this.controls = new TransformControls(camera, domElement);

    this.controls.addEventListener('dragging-changed', (event) => {
      const isDragging = event.value as boolean;
      callbacks.onDragging?.(isDragging);

      if (isDragging) {
        if (this.multiObjects.length > 0 && this.pivot) {
          this.isMultiDragging = true;
          this.pivotStartPosition.copy(this.pivot.position);
          this.pivotStartRotation.copy(this.pivot.rotation);
          this.pivotStartScale.copy(this.pivot.scale);
          this.multiStartTransforms = this.multiObjects.map(obj => ({
            pos: obj.position.clone(),
            rot: obj.rotation.clone(),
            scale: obj.scale.clone(),
          }));
        } else if (this.controls.object) {
          this.dragStartPosition.copy(this.controls.object.position);
          this.dragStartRotation.copy(this.controls.object.rotation);
          this.dragStartScale.copy(this.controls.object.scale);
          callbacks.onDragStart?.(this.controls.object);
        }
      } else {
        if (this.isMultiDragging) {
          this.isMultiDragging = false;
          callbacks.onMultiDragEnd?.(this.multiObjects, this.multiStartTransforms);
        } else if (this.controls.object) {
          callbacks.onDragEnd?.(
            this.controls.object,
            this.dragStartPosition.clone(),
            this.dragStartRotation.clone(),
            this.dragStartScale.clone(),
          );
        }
      }
    });

    this.controls.addEventListener('change', () => {
      if (this.isMultiDragging) {
        this.syncMultiObjects();
      }
      callbacks.requestRender();
    });
  }

  attach(object: Object3D): void {
    this.clearMulti();
    this.controls.attach(object);
    this.callbacks.requestRender();
  }

  attachMulti(objects: Object3D[]): void {
    this.clearMulti();
    this.multiObjects = objects;

    const box = new Box3();
    for (const obj of objects) {
      box.expandByObject(obj);
    }
    const center = new Vector3();
    box.getCenter(center);

    this.pivot = new Object3D();
    this.pivot.position.copy(center);

    this.controls.attach(this.pivot);
    this.callbacks.requestRender();
  }

  detach(): void {
    this.clearMulti();
    this.controls.detach();
    this.callbacks.requestRender();
  }

  setMode(mode: TransformMode): void {
    this.controls.setMode(mode);
    this.callbacks.requestRender();
  }

  setVisible(visible: boolean): void {
    if (!visible && this.controls.dragging) return;
    this.controls.getHelper().visible = visible;
    this.callbacks.requestRender();
  }

  /** 強制設定可見性，拖曳中也可改（供 active viewport 機制使用，繞過 ctrl drag guard） */
  setVisibleForce(visible: boolean): void {
    this.controls.getHelper().visible = visible;
    this.callbacks.requestRender();
  }

  get object(): Object3D | undefined {
    return this.controls.object;
  }

  dispose(): void {
    this.clearMulti();
    this.controls.dispose();
  }

  private clearMulti(): void {
    this.multiObjects = [];
    this.multiStartTransforms = [];
    this.pivot = null;
    this.isMultiDragging = false;
  }

  private syncMultiObjects(): void {
    if (!this.pivot || this.multiObjects.length === 0) return;

    const mode = this.controls.mode;

    if (mode === 'translate') {
      const delta = new Vector3().subVectors(this.pivot.position, this.pivotStartPosition);
      for (let i = 0; i < this.multiObjects.length; i++) {
        this.multiObjects[i].position.copy(this.multiStartTransforms[i].pos).add(delta);
      }
    } else if (mode === 'rotate') {
      const startQuat = new Quaternion().setFromEuler(this.pivotStartRotation);
      const currentQuat = new Quaternion().setFromEuler(this.pivot.rotation);
      const rotDelta = currentQuat.multiply(startQuat.invert());

      for (let i = 0; i < this.multiObjects.length; i++) {
        const obj = this.multiObjects[i];
        const start = this.multiStartTransforms[i];

        const offset = new Vector3().subVectors(start.pos, this.pivotStartPosition);
        offset.applyQuaternion(rotDelta);
        obj.position.copy(this.pivotStartPosition).add(offset);

        const objQuat = new Quaternion().setFromEuler(start.rot);
        objQuat.premultiply(rotDelta);
        obj.rotation.setFromQuaternion(objQuat);
      }
    } else if (mode === 'scale') {
      const sx = this.pivot.scale.x / this.pivotStartScale.x;
      const sy = this.pivot.scale.y / this.pivotStartScale.y;
      const sz = this.pivot.scale.z / this.pivotStartScale.z;
      const scaleFactor = new Vector3(sx, sy, sz);

      for (let i = 0; i < this.multiObjects.length; i++) {
        const obj = this.multiObjects[i];
        const start = this.multiStartTransforms[i];

        const offset = new Vector3().subVectors(start.pos, this.pivotStartPosition);
        offset.multiply(scaleFactor);
        obj.position.copy(this.pivotStartPosition).add(offset);

        obj.scale.copy(start.scale).multiply(scaleFactor);
      }
    }
  }
}
