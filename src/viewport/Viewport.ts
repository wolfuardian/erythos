import { Scene, type Object3D, type Vector3, type Euler } from 'three';
import { ViewportRenderer } from './ViewportRenderer';
import { CameraController } from './CameraController';
import { GizmoManager } from './GizmoManager';
import { SelectionPicker } from './SelectionPicker';
import { GridHelpers } from './GridHelpers';
import { PostProcessing } from './PostProcessing';
import { ShadingManager, type ShadingMode } from './ShadingManager';
import type { TransformMode } from '../core/EventEmitter';

export interface ViewportCallbacks {
  onSelect: (object: Object3D | null) => void;
  onHover: (object: Object3D | null) => void;
  onTransformEnd: (object: Object3D, startPos: Vector3, startRot: Euler, startScale: Vector3) => void;
  resolveTarget?: (object: Object3D) => Object3D;
}

export class Viewport {
  readonly vpRenderer: ViewportRenderer;
  readonly cameraCtrl: CameraController;
  readonly gizmo: GizmoManager;
  readonly picker: SelectionPicker;
  readonly gridHelpers: GridHelpers;
  readonly postProcessing: PostProcessing;
  readonly shading: ShadingManager;

  readonly scene: Scene;
  readonly sceneHelpers: Scene;
  private callbacks: ViewportCallbacks;

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

    this.shading = new ShadingManager(this.vpRenderer.renderer, this.scene);

    this.gizmo = new GizmoManager(
      this.cameraCtrl.camera,
      this.vpRenderer.domElement,
      {
        requestRender,
        onDragging: (isDragging) => {
          this.cameraCtrl.setEnabled(!isDragging);
        },
        onDragEnd: (obj, startPos, startRot, startScale) => {
          this.callbacks.onTransformEnd(obj, startPos, startRot, startScale);
        },
      },
    );

    this.picker = new SelectionPicker({
      requestRender,
      onSelect: (obj) => this.callbacks.onSelect(obj),
      onHover: (obj) => this.callbacks.onHover(obj),
      resolveTarget: callbacks.resolveTarget,
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
    this.vpRenderer.setRenderOverride(() => this.postProcessing.render());
    this.vpRenderer.setBeforeRender(() => this.cameraCtrl.update());

    // Mount submodules
    this.gridHelpers.mount(this.sceneHelpers);
    this.sceneHelpers.add(this.gizmo.controls as unknown as Object3D);
    this.picker.mount(
      this.vpRenderer.domElement,
      this.scene,
      this.cameraCtrl.camera,
    );

    // Ignore gizmo from raycasting
    this.picker.addIgnore(this.gizmo.controls as unknown as Object3D);

    this.vpRenderer.requestRender();
  }

  setSelectedObject(object: Object3D | null): void {
    if (object) {
      this.gizmo.attach(object);
      this.postProcessing.setSelectedObjects([object]);
    } else {
      this.gizmo.detach();
      this.postProcessing.setSelectedObjects([]);
    }
    this.vpRenderer.requestRender();
  }

  setHoveredObject(object: Object3D | null): void {
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

  focusObject(object: Object3D): void {
    this.cameraCtrl.focusObject(object);
  }

  requestRender(): void {
    this.vpRenderer.requestRender();
  }

  dispose(): void {
    this.picker.dispose();
    this.gizmo.dispose();
    this.gridHelpers.dispose();
    this.postProcessing.dispose();
    this.shading.dispose();
    this.cameraCtrl.dispose();
    this.vpRenderer.dispose();
  }
}
