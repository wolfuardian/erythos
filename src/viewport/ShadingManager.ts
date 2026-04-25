import {
  DirectionalLight,
  Euler,
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
  type DataTexture,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ShadingMode = 'wireframe' | 'solid' | 'shading' | 'rendering';
export type LookdevPreset = 'none' | 'room' | 'factory';

export class ShadingManager {
  private renderer: WebGLRenderer;
  private sceneHelpers: Scene; // viewport-local; headlight camera lives here
  private camera: Camera;
  private _mode: ShadingMode = 'solid';
  private _modeMaterial: Material | null = null;
  private _envIntensity = 1.0;
  private _envRotation = 0.0;
  private headlight: DirectionalLight;
  private headlightTarget: Object3D;
  private defaultEnv: ReturnType<PMREMGenerator['fromScene']> | null = null;
  private customEnv: ReturnType<PMREMGenerator['fromEquirectangular']> | null = null;
  private _lookdevPreset: LookdevPreset = 'room';
  private _sceneLightsOverride: boolean | undefined = undefined;

  constructor(renderer: WebGLRenderer, sceneHelpers: Scene, camera: Camera) {
    this.renderer = renderer;
    this.sceneHelpers = sceneHelpers;
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

  setSceneLightsEnabled(enabled: boolean): void {
    this._sceneLightsOverride = enabled;
    this.applyLayerMask();
  }

  clearSceneLightsOverride(): void {
    this._sceneLightsOverride = undefined;
    this.applyLayerMask();
  }

  setEnvironmentIntensity(intensity: number): void {
    this._envIntensity = intensity;
  }

  setEnvironmentRotation(angleRadians: number): void {
    this._envRotation = angleRadians;
  }

  setCustomHDRI(hdrTexture: DataTexture | null): void {
    // 清除舊的自訂環境
    this.customEnv?.dispose();
    this.customEnv = null;

    if (hdrTexture) {
      const pmrem = new PMREMGenerator(this.renderer);
      this.customEnv = pmrem.fromEquirectangular(hdrTexture);
      pmrem.dispose();
      hdrTexture.dispose(); // DataTexture 不再需要
    }
    // 不直接寫 scene.environment；由 wrapRender 在每幀 render 時套用
  }

  setLookdevPreset(preset: LookdevPreset): void {
    this._lookdevPreset = preset;
    // 切換時預建 defaultEnv（room / factory fallback 都需要）
    if (preset !== 'none') {
      this.ensureDefaultEnv();
    }
  }

  /**
   * Render-time state swap：set → renderFn → restore。
   * Viewport 在 render override 裡呼叫；scene 每幀傳入（不存引用）。
   */
  wrapRender(scene: Scene, renderFn: () => void): void {
    // --- capture ---
    const prevOverrideMaterial = scene.overrideMaterial;
    const prevEnvironment = scene.environment;
    const prevEnvIntensity = (scene as any).environmentIntensity as number | undefined;
    const prevEnvRotation = (scene as any).environmentRotation?.y as number | undefined;

    try {
      // --- set ---
      scene.overrideMaterial = this._modeMaterial;

      if (this._mode === 'rendering') {
        scene.environment = this.customEnv?.texture ?? this.defaultEnv?.texture ?? null;
        (scene as any).environmentIntensity = this._envIntensity;
        if ((scene as any).environmentRotation) {
          (scene as any).environmentRotation.y = this._envRotation;
        } else {
          (scene as any).environmentRotation = new Euler(0, this._envRotation, 0);
        }
      } else if (this._mode === 'shading') {
        // shading：依 lookdevPreset 決定是否套用環境
        // factory fallback room（UI 標 disabled，防禦性 fallback）
        const useRoom = this._lookdevPreset === 'room' || this._lookdevPreset === 'factory';
        if (useRoom) {
          this.ensureDefaultEnv();
          scene.environment = this.defaultEnv?.texture ?? null;
          (scene as any).environmentIntensity = this._envIntensity;
          if ((scene as any).environmentRotation) {
            (scene as any).environmentRotation.y = this._envRotation;
          } else {
            (scene as any).environmentRotation = new Euler(0, this._envRotation, 0);
          }
        } else {
          // none
          scene.environment = null;
        }
      } else {
        // solid / wireframe：明確隔離 HDRI
        scene.environment = null;
      }

      // --- render ---
      renderFn();
    } finally {
      // --- restore（renderFn throw 時仍執行）---
      scene.overrideMaterial = prevOverrideMaterial;
      scene.environment = prevEnvironment;
      if (prevEnvIntensity !== undefined) {
        (scene as any).environmentIntensity = prevEnvIntensity;
      } else {
        delete (scene as any).environmentIntensity;
      }
      if ((scene as any).environmentRotation) {
        if (prevEnvRotation !== undefined) {
          (scene as any).environmentRotation.y = prevEnvRotation;
        } else {
          delete (scene as any).environmentRotation;
        }
      }
    }
  }

  private restoreAll(): void {
    this.restoreMaterials();
    this.removeHeadlight();
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // 不直接清 scene.environment；由 wrapRender 負責 per-frame restore
  }

  private applyMode(): void {
    switch (this._mode) {
      case 'wireframe':
        this.renderer.toneMapping = NoToneMapping;
        this._modeMaterial = new MeshBasicMaterial({ wireframe: true, color: 0x888888 });
        break;
      case 'solid':
        this.renderer.toneMapping = NoToneMapping;
        this.addHeadlight();
        this._modeMaterial = new MeshLambertMaterial({ color: 0xffffff });
        break;
      case 'shading':
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this._modeMaterial = null;
        break;
      case 'rendering':
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.ensureDefaultEnv();
        this._modeMaterial = null;
        break;
    }
    this.applyLayerMask();
  }

  private applyLayerMask(): void {
    // mode default
    let defaultEnabled: boolean;
    switch (this._mode) {
      case 'solid':
      case 'rendering':
        defaultEnabled = true;
        break;
      case 'shading':
      case 'wireframe':
      default:
        defaultEnabled = false;
        break;
    }
    // override 蓋掉 default（undefined = 不 override）
    const enabled = this._sceneLightsOverride ?? defaultEnabled;
    if (enabled) {
      this.camera.layers.enable(1);
    } else {
      this.camera.layers.disable(1);
    }
  }

  private addHeadlight(): void {
    this.camera.add(this.headlight);
    this.camera.add(this.headlightTarget);
    this.sceneHelpers.add(this.camera);  // 改放 sceneHelpers（viewport-local）
  }

  private removeHeadlight(): void {
    this.sceneHelpers.remove(this.camera);  // 從 sceneHelpers 移除
    this.camera.remove(this.headlight);
    this.camera.remove(this.headlightTarget);
  }

  private ensureDefaultEnv(): void {
    if (this.defaultEnv) return;
    const pmrem = new PMREMGenerator(this.renderer);
    this.defaultEnv = pmrem.fromScene(new RoomEnvironment());
    pmrem.dispose();
  }

  private restoreMaterials(): void {
    this._modeMaterial?.dispose();
    this._modeMaterial = null;
  }

  dispose(): void {
    this.restoreMaterials();
    this.removeHeadlight();
    this.defaultEnv?.dispose();
    this.customEnv?.dispose();
  }
}
