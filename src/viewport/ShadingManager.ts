import {
  MeshBasicMaterial,
  MeshStandardMaterial,
  ACESFilmicToneMapping,
  NoToneMapping,
  PMREMGenerator,
  type WebGLRenderer,
  type Scene,
  type Material,
  type Mesh,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type ShadingMode = 'wireframe' | 'solid' | 'material' | 'rendered';

interface MaterialBackup {
  original: Material | Material[];
}

export class ShadingManager {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private _mode: ShadingMode = 'solid';
  private backups = new Map<Mesh, MaterialBackup>();
  private defaultEnv: ReturnType<PMREMGenerator['fromScene']> | null = null;

  constructor(renderer: WebGLRenderer, scene: Scene) {
    this.renderer = renderer;
    this.scene = scene;
  }

  get mode(): ShadingMode { return this._mode; }

  setMode(mode: ShadingMode): void {
    if (this._mode === mode) return;
    this.restoreMaterials();
    this._mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    switch (this._mode) {
      case 'wireframe':
        this.renderer.toneMapping = NoToneMapping;
        this.scene.environment = null;
        this.overrideMaterials(() => {
          return new MeshBasicMaterial({ wireframe: true, color: 0x888888 });
        });
        break;

      case 'solid':
        this.renderer.toneMapping = NoToneMapping;
        this.scene.environment = null;
        this.overrideMaterials(() => {
          return new MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.0,
          });
        });
        break;

      case 'material':
        this.renderer.toneMapping = NoToneMapping;
        this.scene.environment = null;
        break;

      case 'rendered':
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.ensureDefaultEnv();
        this.scene.environment = this.defaultEnv?.texture ?? null;
        break;
    }
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
      this.backups.set(mesh, { original: mesh.material });
      mesh.material = factory(mesh);
    });
  }

  private restoreMaterials(): void {
    for (const [mesh, backup] of this.backups) {
      mesh.material = backup.original;
    }
    this.backups.clear();
  }

  dispose(): void {
    this.restoreMaterials();
    this.defaultEnv?.dispose();
  }
}
