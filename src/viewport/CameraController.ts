import { PerspectiveCamera, Box3, Vector3, MOUSE, type Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  readonly camera: PerspectiveCamera;
  controls: OrbitControls;
  private requestRender: () => void;
  private focusAnim: number | null = null;

  constructor(requestRender: () => void) {
    this.requestRender = requestRender;
    this.camera = new PerspectiveCamera(50, 1, 0.01, 1000);
    this.camera.position.set(5, 3, 5);
    this.camera.lookAt(0, 0, 0);

    // OrbitControls needs a dummy element initially; replaced on mount
    this.controls = new OrbitControls(this.camera, document.createElement('div'));
    this.controls.enableDamping = false;
    this.controls.mouseButtons = { LEFT: null as any, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    this.controls.addEventListener('change', () => this.requestRender());
  }

  mount(domElement: HTMLCanvasElement): void {
    this.controls.dispose();
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = false;
    this.controls.mouseButtons = { LEFT: null as any, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    this.controls.addEventListener('change', () => this.requestRender());
  }

  update(): void {
    this.controls.update();
  }

  /** Focus camera on the given object with a smooth tween animation. */
  focusObject(object: Object3D): void {
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;

    // Cancel any in-progress focus animation
    if (this.focusAnim !== null) {
      cancelAnimationFrame(this.focusAnim);
      this.focusAnim = null;
    }

    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

    const endPos = center.clone().add(
      this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(dist)
    );
    const endTarget = center.clone();

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const duration = 400;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic

      this.camera.position.lerpVectors(startPos, endPos, e);
      this.controls.target.lerpVectors(startTarget, endTarget, e);
      this.controls.update();
      this.requestRender();

      if (t < 1) {
        this.focusAnim = requestAnimationFrame(animate);
      } else {
        this.focusAnim = null;
      }
    };

    this.focusAnim = requestAnimationFrame(animate);
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  dispose(): void {
    if (this.focusAnim !== null) {
      cancelAnimationFrame(this.focusAnim);
      this.focusAnim = null;
    }
    this.controls.dispose();
  }
}
