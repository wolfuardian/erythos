import { PerspectiveCamera, Box3, Vector3, type Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  readonly camera: PerspectiveCamera;
  controls: OrbitControls;
  private requestRender: () => void;

  constructor(requestRender: () => void) {
    this.requestRender = requestRender;
    this.camera = new PerspectiveCamera(50, 1, 0.01, 1000);
    this.camera.position.set(5, 3, 5);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls needs a dummy element initially; replaced on mount
    this.controls = new OrbitControls(this.camera, document.createElement('div'));
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.addEventListener('change', () => this.requestRender());
  }

  mount(domElement: HTMLCanvasElement): void {
    this.controls.dispose();
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.addEventListener('change', () => this.requestRender());
  }

  update(): void {
    this.controls.update();
  }

  /** Focus camera on the given object (instant, no animation). */
  focusObject(object: Object3D): void {
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;

    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

    const targetPos = center.clone().add(
      this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(dist)
    );

    this.camera.position.copy(targetPos);
    this.controls.target.copy(center);
    this.controls.update();
    this.requestRender();
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  dispose(): void {
    this.controls.dispose();
  }
}
