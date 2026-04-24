import { Scene, type Object3D, type Vector3, type Euler, type DataTexture } from 'three';
import { ViewportRenderer } from './ViewportRenderer';
import { CameraController } from './CameraController';
import { GizmoManager } from './GizmoManager';
import { SelectionPicker } from './SelectionPicker';
import { BoxSelector } from './BoxSelector';
import { GridHelpers } from './GridHelpers';
import { PostProcessing } from './PostProcessing';
import { ShadingManager, type ShadingMode } from './ShadingManager';
import type { TransformMode } from '../core/EventEmitter';
import type { RenderSettings } from './RenderSettings';

export interface ViewportCallbacks {
  onSelect: (object: Object3D | null, modifier: { ctrl: boolean }) => void;
  onHover: (object: Object3D | null, modifier: { ctrl: boolean }) => void;
  onTransformEnd: (object: Object3D, startPos: Vector3, startRot: Euler, startScale: Vector3) => void;
  onBoxSelect?: (objects: Object3D[], modifier: { ctrl: boolean }) => void;
  onMultiTransformEnd?: (objects: Object3D[], startTransforms: { pos: Vector3; rot: Euler; scale: Vector3 }[]) => void;
  /** Return true if obj is a SceneSync entity. Used by picker to find the nearest entity. */
  isEntity?: (object: Object3D) => boolean;
  resolveTarget?: (object: Object3D, modifier: { ctrl: boolean }) => Object3D;
}

export class Viewport {
  readonly vpRenderer: ViewportRenderer;
  readonly cameraCtrl: CameraController;
  readonly gizmo: GizmoManager;
  readonly picker: SelectionPicker;
  readonly boxSelector: BoxSelector;
  readonly gridHelpers: GridHelpers;
  readonly postProcessing: PostProcessing;
  readonly shading: ShadingManager;

  readonly scene: Scene;
  readonly sceneHelpers: Scene;
  private callbacks: ViewportCallbacks;
  private _boxDragging = false;

  constructor(scene: Scene, callbacks: ViewportCallbacks) {
    this.scene = scene;
    this.sceneHelpers = new Scene();
    this.sceneHelpers.name = '__helpers';
    this.callbacks = callbacks;

    const requestRender = () => this.vpRenderer.requestRender();

    this.vpRenderer = new ViewportRenderer();
    this.cameraCtrl = new CameraController(requestRender);
    this.gridHelpers = new GridHelpers();

    // PostProcessing (created after renderer, before mount)
    this.postProcessing = new PostProcessing(
      this.vpRenderer.renderer,
      this.scene,
      this.sceneHelpers,
      this.cameraCtrl.camera,
    );

    this.shading = new ShadingManager(this.vpRenderer.renderer, this.scene, this.sceneHelpers, this.cameraCtrl.camera);

    this.gizmo = new GizmoManager(
      this.cameraCtrl.camera,
      this.vpRenderer.domElement,
      {
        requestRender,
        onDragging: (isDragging) => {
          this.cameraCtrl.setEnabled(!isDragging);
          this.boxSelector.setEnabled(!isDragging);
        },
        onDragEnd: (obj, startPos, startRot, startScale) => {
          this.callbacks.onTransformEnd(obj, startPos, startRot, startScale);
        },
        onMultiDragEnd: (objects, startTransforms) => {
          this.callbacks.onMultiTransformEnd?.(objects, startTransforms);
        },
      },
    );

    this.picker = new SelectionPicker({
      requestRender,
      onSelect: (obj, modifier) => this.callbacks.onSelect(obj, modifier),
      onHover: (obj, modifier) => this.callbacks.onHover(obj, modifier),
      isEntity: callbacks.isEntity,
      resolveTarget: callbacks.resolveTarget,
    });

    this.boxSelector = new BoxSelector({
      requestRender,
      onBoxSelect: (objects, modifier) => this.callbacks.onBoxSelect?.(objects, modifier),
      onBoxDragStart: () => { this._boxDragging = true; },
      onBoxDragEnd: () => { this._boxDragging = false; },
      onBoxHover: (objects) => {
        this.postProcessing.setHoveredObjects(objects);
        this.vpRenderer.requestRender();
      },
    });
  }

  mount(container: HTMLElement): void {
    this.vpRenderer.mount(
      container,
      this.scene,
      this.sceneHelpers,
      this.cameraCtrl.camera,
    );

    this.cameraCtrl.mount(this.vpRenderer.domElement);

    // Wire up post-processing as render override
    this.vpRenderer.setRenderOverride(() => {
      this.shading.wrapRender(this.scene, () => this.postProcessing.render());
    });
    this.vpRenderer.setBeforeRender(() => this.cameraCtrl.update());
    this.vpRenderer.setOnResize((w, h) => {
      this.postProcessing.setSize(w, h);
    });
    // 觸發初始尺寸，確保 LOW 模式從一開始就有正確的 render target 大小
    this.postProcessing.setSize(this.vpRenderer.width, this.vpRenderer.height);

    // Mount submodules
    this.gridHelpers.mount(this.scene);
    this.sceneHelpers.add(this.gizmo.controls.getHelper());
    this.picker.mount(
      this.vpRenderer.domElement,
      this.scene,
      this.cameraCtrl.camera,
    );

    // Ignore gizmo from raycasting / box-select
    this.picker.addIgnore(this.gizmo.controls.getHelper());

    this.boxSelector.mount(container, this.scene, this.cameraCtrl.camera);
    this.boxSelector.addIgnore(this.gizmo.controls.getHelper());

    this.vpRenderer.requestRender();
  }

  setSelectedObjects(objects: Object3D[]): void {
    this.postProcessing.setSelectedObjects(objects);
    if (objects.length === 1) {
      this.gizmo.attach(objects[0]);
    } else if (objects.length > 1) {
      this.gizmo.attachMulti(objects);
    } else {
      this.gizmo.detach();
    }
    this.vpRenderer.requestRender();
  }

  setHoveredObject(object: Object3D | null): void {
    if (this._boxDragging) return;
    this.postProcessing.setHoveredObjects(object ? [object] : []);
    this.vpRenderer.requestRender();
  }

  setTransformMode(mode: TransformMode): void {
    this.gizmo.setMode(mode);
  }

  setShadingMode(mode: ShadingMode): void {
    this.shading.setMode(mode);
    this.vpRenderer.syncRender();
  }

  setRenderSettings(settings: RenderSettings): void {
    this.postProcessing.applyRenderSettings(settings);
    this.vpRenderer.requestRender();
  }

  setEnvironmentIntensity(intensity: number): void {
    this.shading.setEnvironmentIntensity(intensity);
    this.vpRenderer.requestRender();
  }

  setEnvironmentRotation(angleRadians: number): void {
    this.shading.setEnvironmentRotation(angleRadians);
    this.vpRenderer.requestRender();
  }

  setCustomHDRI(hdrTexture: DataTexture | null): void {
    this.shading.setCustomHDRI(hdrTexture);
    this.vpRenderer.requestRender();
  }

  setQuality(quality: import('./PostProcessing').QualityLevel): void {
    this.postProcessing.setQuality(quality);
    this.vpRenderer.syncRender();
  }

  focusObject(object: Object3D): void {
    this.cameraCtrl.focusObject(object);
  }

  requestRender(): void {
    this.vpRenderer.requestRender();
  }

  dispose(): void {
    this.picker.dispose();
    this.boxSelector.dispose();
    this.gizmo.dispose();
    this.gridHelpers.dispose();
    this.postProcessing.dispose();
    this.shading.dispose();
    this.cameraCtrl.dispose();
    this.vpRenderer.dispose();
  }
}
