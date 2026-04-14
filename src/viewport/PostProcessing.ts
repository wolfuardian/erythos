import { type WebGLRenderer, type Scene, type Camera, type Object3D, type Mesh, Vector2 } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

export type QualityLevel = 'low' | 'normal' | 'high';

export class PostProcessing {
  readonly composer: EffectComposer;
  private selectOutline: OutlinePass;
  private hoverOutline: OutlinePass;
  private fxaaPass: ShaderPass;
  private sceneHelpers: Scene;
  private camera: Camera;
  private renderer: WebGLRenderer;
  private _quality: QualityLevel = 'normal';
  private _logicalW = 0;
  private _logicalH = 0;

  constructor(renderer: WebGLRenderer, scene: Scene, sceneHelpers: Scene, camera: Camera) {
    this.renderer = renderer;
    this.sceneHelpers = sceneHelpers;
    this.camera = camera;

    const size = new Vector2(renderer.domElement.clientWidth || 1, renderer.domElement.clientHeight || 1);

    this.composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    this.selectOutline = new OutlinePass(size, scene, camera);
    this.selectOutline.edgeStrength = 3;
    this.selectOutline.edgeThickness = 1;
    this.selectOutline.visibleEdgeColor.setHex(0x4a7fbf);
    this.selectOutline.hiddenEdgeColor.setHex(0x2a4a70);
    this.composer.addPass(this.selectOutline);

    this.hoverOutline = new OutlinePass(size, scene, camera);
    this.hoverOutline.edgeStrength = 2;
    this.hoverOutline.edgeThickness = 1;
    this.hoverOutline.visibleEdgeColor.setHex(0xf0f0f0);
    this.hoverOutline.hiddenEdgeColor.setHex(0x808080);
    this.composer.addPass(this.hoverOutline);

    // FXAA pass - 預設 disabled，HIGH 模式才啟用
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.enabled = false;
    this.composer.addPass(this.fxaaPass);
  }

  get quality(): QualityLevel { return this._quality; }

  setQuality(quality: QualityLevel): void {
    this._quality = quality;
    this.fxaaPass.enabled = quality === 'high';
    this.applySize();
  }

  /** 由 ViewportRenderer resize callback 呼叫，傳入邏輯像素（CSS px） */
  setSize(logicalW: number, logicalH: number): void {
    this._logicalW = logicalW;
    this._logicalH = logicalH;
    this.applySize();
  }

  private applySize(): void {
    const pixelRatio = this._quality === 'low' ? 1 : this.renderer.getPixelRatio();
    const w = Math.max(1, Math.round(this._logicalW * pixelRatio));
    const h = Math.max(1, Math.round(this._logicalH * pixelRatio));
    this.composer.setSize(w, h);
    if (this.fxaaPass.enabled) {
      this.fxaaPass.material.uniforms['resolution'].value.set(1 / w, 1 / h);
    }
  }

  setSelectedObjects(objects: Object3D[]): void {
    this.selectOutline.selectedObjects = collectMeshes(objects);
  }

  setHoveredObjects(objects: Object3D[]): void {
    this.hoverOutline.selectedObjects = collectMeshes(objects);
  }

  render(): void {
    this.composer.render();
    const renderer = this.composer.renderer;
    renderer.autoClear = false;
    renderer.render(this.sceneHelpers, this.camera);
    renderer.autoClear = true;
  }

  dispose(): void {
    this.composer.dispose();
  }
}

function collectMeshes(objects: Object3D[]): Object3D[] {
  const meshes: Object3D[] = [];
  for (const obj of objects) {
    obj.traverse((child) => {
      if ((child as Mesh).isMesh) meshes.push(child);
    });
  }
  return meshes;
}
