import {
  DirectionalLight,
  MeshBasicMaterial,
  MeshLambertMaterial,
  ACESFilmicToneMapping,
  NoToneMapping,
  PMREMGenerator,
  Object3D,
  type WebGLRenderer,
  type Scene,
  type Camera,
  type Material,
  type Mesh,
  type Light,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ShadingMode = 'wireframe' | 'solid' | 'shading' | 'rendering';

interface MaterialBackup { original: Material | Material[]; }
interface LightBackup { light: Light; visible: boolean; }

export class ShadingManager {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: Camera;
  private _mode: ShadingMode = 'solid';
  private materialBackups = new Map<Mesh, MaterialBackup>();
  private lightBackups: LightBackup[] = [];
  private headlight: DirectionalLight;
  private headlightTarget: Object3D;
  private defaultEnv: ReturnType<PMREMGenerator['fromScene']> | null = null;
  private _sceneLightsEnabled = true;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // headlight 掛在 camera 子節點，position(0,0,1) = 在 camera 背後，
    // target(0,0,-1) = camera 正前方，產生與視線同向的頭燈效果
    this.headlight = new DirectionalLight(0xffffff, 1.5);
    this.headlightTarget = new Object3D();
    this.headlight.position.set(0, 0, 1);
    this.headlightTarget.position.set(0, 0, -1);
    this.headlight.target = this.headlightTarget;
  }

  get mode(): ShadingMode { return this._mode; }
  get sceneLightsEnabled(): boolean { return this._sceneLightsEnabled; }

  setMode(mode: ShadingMode): void {
    if (this._mode === mode) return;
    this.restoreAll();
    this._mode = mode;
    this.applyMode();
  }

  /** 強制重新套用目前模式，繞過 early return。場景替換後使用。 */
  forceApply(): void {
    this.restoreAll();
    this.applyMode();
  }

  /** 僅 shading 模式下有效，切換場景燈影響 */
  setSceneLightsEnabled(enabled: boolean): void {
    if (this._mode !== 'shading') return;
    if (enabled === this._sceneLightsEnabled) return;
    this._sceneLightsEnabled = enabled;
    if (enabled) {
      this.restoreSceneLights();
    } else {
      this.disableSceneLights();
    }
  }

  private restoreAll(): void {
    this.restoreMaterials();
    this.restoreSceneLights();
    this.removeHeadlight();
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.scene.environment = null;
    this._sceneLightsEnabled = true;
  }

  private applyMode(): void {
    switch (this._mode) {
      case 'wireframe':
        this.renderer.toneMapping = NoToneMapping;
        this.disableSceneLights();
        this.overrideMaterials(() => new MeshBasicMaterial({ wireframe: true, color: 0x888888 }));
        break;
      case 'solid':
        this.renderer.toneMapping = NoToneMapping;
        this.disableSceneLights();
        this.addHeadlight();
        this.overrideMaterials(() => new MeshLambertMaterial({ color: 0xffffff }));
        break;
      case 'shading':
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.ensureDefaultEnv();
        this.scene.environment = this.defaultEnv?.texture ?? null;
        // 場景燈預設開，使用者可用 setSceneLightsEnabled 切換
        break;
      case 'rendering':
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.ensureDefaultEnv();
        this.scene.environment = this.defaultEnv?.texture ?? null;
        break;
    }
  }

  private addHeadlight(): void {
    this.camera.add(this.headlight);
    this.camera.add(this.headlightTarget);
    this.scene.add(this.camera);  // 讓 camera 的子節點（headlight）被 renderer 處理
  }

  private removeHeadlight(): void {
    this.scene.remove(this.camera);  // 移除 camera 避免影響其他模式
    this.camera.remove(this.headlight);
    this.camera.remove(this.headlightTarget);
  }

  private disableSceneLights(): void {
    this.lightBackups = [];
    this.scene.traverse((child) => {
      if ((child as unknown as Light).isLight) {
        const light = child as unknown as Light;
        this.lightBackups.push({ light, visible: light.visible });
        light.visible = false;
      }
    });
  }

  private restoreSceneLights(): void {
    for (const { light, visible } of this.lightBackups) {
      light.visible = visible;
    }
    this.lightBackups = [];
  }

  private ensureDefaultEnv(): void {
    if (this.defaultEnv) return;
    const pmrem = new PMREMGenerator(this.renderer);
    this.defaultEnv = pmrem.fromScene(new RoomEnvironment());
    pmrem.dispose();
  }

  private overrideMaterials(factory: (mesh: Mesh) => Material): void {
    this.scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      this.materialBackups.set(mesh, { original: mesh.material });
      mesh.material = factory(mesh);
    });
  }

  private restoreMaterials(): void {
    for (const [mesh, backup] of this.materialBackups) {
      mesh.material = backup.original;
    }
    this.materialBackups.clear();
  }

  dispose(): void {
    this.restoreMaterials();
    this.restoreSceneLights();
    this.removeHeadlight();
    this.defaultEnv?.dispose();
  }
}
