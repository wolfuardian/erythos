import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  ACESFilmicToneMapping,
} from 'three';

export class ViewportRenderer {
  readonly renderer: WebGLRenderer;
  private scene!: Scene;
  private sceneHelpers!: Scene;
  private camera!: PerspectiveCamera;
  private container!: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  private _needsRender = true;
  private animFrameId = 0;
  private onBeforeRender?: () => void;
  private renderOverride?: () => void;

  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x1a1a1a);
  }

  mount(
    container: HTMLElement,
    scene: Scene,
    sceneHelpers: Scene,
    camera: PerspectiveCamera,
  ): void {
    this.container = container;
    this.scene = scene;
    this.sceneHelpers = sceneHelpers;
    this.camera = camera;

    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.updateSize();
    this.resizeObserver = new ResizeObserver(() => {
      this.updateSize();
      this.requestRender();
    });
    this.resizeObserver.observe(container);

    this.startLoop();
  }

  setBeforeRender(fn: () => void): void {
    this.onBeforeRender = fn;
  }

  /** Override the default render call (used by PostProcessing). */
  setRenderOverride(fn: (() => void) | undefined): void {
    this.renderOverride = fn;
  }

  requestRender(): void {
    this._needsRender = true;
  }

  /** Immediate synchronous render (e.g., after shading mode change). */
  syncRender(): void {
    this.onBeforeRender?.();
    this.doRender();
    this.doRender(); // double-render to flush shader recompilation
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get width(): number {
    return this.container?.clientWidth ?? 0;
  }

  get height(): number {
    return this.container?.clientHeight ?? 0;
  }

  private startLoop(): void {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      if (!this._needsRender) return;
      this._needsRender = false;
      this.onBeforeRender?.();
      this.doRender();
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private doRender(): void {
    if (this.renderOverride) {
      this.renderOverride();
    } else {
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = false;
      this.renderer.render(this.sceneHelpers, this.camera);
      this.renderer.autoClear = true;
    }
  }

  private updateSize(): void {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
