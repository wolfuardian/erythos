import { type WebGLRenderer, type Scene, type Camera, type Object3D, type Mesh, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, ReinhardToneMapping, CineonToneMapping, NoToneMapping } from 'three';
import type { RenderSettings } from './RenderSettings';

export type QualityLevel = 'low' | 'normal' | 'high';

export class PostProcessing {
  readonly composer: EffectComposer;
  private selectOutline: OutlinePass;
  private hoverOutline: OutlinePass;
  private fxaaPass: ShaderPass;
  private bloomPass: UnrealBloomPass;
  private ssaoPass: SSAOPass;
  private bokehPass: BokehPass;
  private afterimagePass: AfterimagePass;
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

    const renderTarget = new WebGLRenderTarget(size.x, size.y);
    this.composer = new EffectComposer(renderer, renderTarget);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // SSAO (Ambient Occlusion) — 在 outline 前
    this.ssaoPass = new SSAOPass(scene, camera, size.x, size.y);
    this.ssaoPass.kernelRadius = 0.1;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.1;
    this.ssaoPass.enabled = false;
    this.composer.addPass(this.ssaoPass);

    // DOF (Depth of Field)
    this.bokehPass = new BokehPass(scene, camera, {
      focus: 5.0,
      aperture: 0.025,
      maxblur: 0.01,
    });
    this.bokehPass.enabled = false;
    this.composer.addPass(this.bokehPass);

    // Bloom
    this.bloomPass = new UnrealBloomPass(size, 0.5, 0.4, 0.85);
    this.bloomPass.enabled = false;
    this.composer.addPass(this.bloomPass);

    // Motion Blur (Afterimage)
    this.afterimagePass = new AfterimagePass(0.7);
    this.afterimagePass.enabled = false;
    this.composer.addPass(this.afterimagePass);

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

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  get quality(): QualityLevel { return this._quality; }

  setQuality(quality: QualityLevel): void {
    this._quality = quality;
    this.fxaaPass.enabled = quality === 'high';
    this.applySize();
  }

  applyRenderSettings(settings: RenderSettings): void {
    // Tone mapping
    if (!settings.toneMapping.enabled) {
      this.renderer.toneMapping = NoToneMapping;
    } else {
      switch (settings.toneMapping.mode) {
        case 'aces':     this.renderer.toneMapping = ACESFilmicToneMapping; break;
        case 'agx':      this.renderer.toneMapping = AgXToneMapping; break;
        case 'neutral':  this.renderer.toneMapping = NeutralToneMapping; break;
        case 'reinhard': this.renderer.toneMapping = ReinhardToneMapping; break;
        case 'cineon':   this.renderer.toneMapping = CineonToneMapping; break;
      }
    }
    this.renderer.toneMappingExposure = settings.toneMapping.exposure;

    // Bloom
    this.bloomPass.enabled = settings.bloom.enabled;
    this.bloomPass.strength = settings.bloom.strength;
    this.bloomPass.radius = settings.bloom.radius;
    this.bloomPass.threshold = settings.bloom.threshold;

    // AO
    this.ssaoPass.enabled = settings.ao.enabled;
    this.ssaoPass.kernelRadius = settings.ao.radius;
    // SSAOPass intensity is controlled via output property
    this.ssaoPass.minDistance = settings.ao.intensity * 0.001;
    this.ssaoPass.maxDistance = settings.ao.intensity * 0.1;

    // DOF
    this.bokehPass.enabled = settings.dof.enabled;
    (this.bokehPass.uniforms as Record<string, { value: number }>)['focus'].value = settings.dof.focus;
    (this.bokehPass.uniforms as Record<string, { value: number }>)['aperture'].value = settings.dof.aperture;
    (this.bokehPass.uniforms as Record<string, { value: number }>)['maxblur'].value = settings.dof.maxBlur;

    // Motion Blur
    this.afterimagePass.enabled = settings.motionBlur.enabled;
    (this.afterimagePass.uniforms as Record<string, { value: number }>)['damp'].value = settings.motionBlur.strength;
  }

  /** 由 ViewportRenderer resize callback 呼叫，傳入邏輯像素（CSS px） */
  setSize(logicalW: number, logicalH: number): void {
    this._logicalW = logicalW;
    this._logicalH = logicalH;
    this.applySize();
  }

  private applySize(): void {
    let pixelRatio: number;
    if (this._quality === 'low') {
      pixelRatio = 0.5;
    } else if (this._quality === 'normal') {
      pixelRatio = 1.0;
    } else {
      pixelRatio = window.devicePixelRatio;
    }
    const w = Math.max(1, Math.round(this._logicalW * pixelRatio));
    const h = Math.max(1, Math.round(this._logicalH * pixelRatio));
    this.composer.setSize(w, h);
    if (this.ssaoPass) this.ssaoPass.setSize(w, h);
    if (this.bokehPass) this.bokehPass.setSize(w, h);
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
    renderer.autoClearDepth = false;
    renderer.render(this.sceneHelpers, this.camera);
    renderer.autoClearDepth = true;
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
