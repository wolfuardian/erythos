import { type WebGLRenderer, type Scene, type Camera, type Object3D, type Mesh } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { Vector2 } from 'three';

export class PostProcessing {
  readonly composer: EffectComposer;
  private selectOutline: OutlinePass;
  private hoverOutline: OutlinePass;
  private sceneHelpers: Scene;
  private camera: Camera;

  constructor(renderer: WebGLRenderer, scene: Scene, sceneHelpers: Scene, camera: Camera) {
    this.sceneHelpers = sceneHelpers;
    this.camera = camera;
    const size = renderer.getSize(new Vector2());

    this.composer = new EffectComposer(renderer);

    // Main scene pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Selection outline
    this.selectOutline = new OutlinePass(size, scene, camera);
    this.selectOutline.edgeStrength = 3;
    this.selectOutline.edgeThickness = 1;
    this.selectOutline.visibleEdgeColor.setHex(0x4a7fbf);
    this.selectOutline.hiddenEdgeColor.setHex(0x2a4a70);
    this.composer.addPass(this.selectOutline);

    // Hover outline
    this.hoverOutline = new OutlinePass(size, scene, camera);
    this.hoverOutline.edgeStrength = 2;
    this.hoverOutline.edgeThickness = 1;
    this.hoverOutline.visibleEdgeColor.setHex(0xf0f0f0);
    this.hoverOutline.hiddenEdgeColor.setHex(0x808080);
    this.composer.addPass(this.hoverOutline);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setSelectedObjects(objects: Object3D[]): void {
    this.selectOutline.selectedObjects = collectMeshes(objects);
  }

  setHoveredObjects(objects: Object3D[]): void {
    this.hoverOutline.selectedObjects = collectMeshes(objects);
  }

  render(): void {
    this.composer.render();
    // Render helpers on top without clearing
    const renderer = this.composer.renderer;
    renderer.autoClear = false;
    renderer.render(this.sceneHelpers, this.camera);
    renderer.autoClear = true;
  }

  dispose(): void {
    this.composer.dispose();
  }
}

/** Collect all Mesh descendants from a list of objects. */
function collectMeshes(objects: Object3D[]): Object3D[] {
  const meshes: Object3D[] = [];
  for (const obj of objects) {
    obj.traverse((child) => {
      if ((child as Mesh).isMesh) meshes.push(child);
    });
  }
  return meshes;
}
