import { GridHelper, AxesHelper, type Scene } from 'three';

export class GridHelpers {
  readonly grid: GridHelper;
  readonly axes: AxesHelper;
  private scene!: Scene;

  constructor() {
    this.grid = new GridHelper(20, 20, 0x444444, 0x333333);
    this.grid.name = '__grid';

    this.axes = new AxesHelper(1);
    this.axes.name = '__axes';
  }

  mount(sceneHelpers: Scene): void {
    this.scene = sceneHelpers;
    this.scene.add(this.grid);
    this.scene.add(this.axes);
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  setAxesVisible(visible: boolean): void {
    this.axes.visible = visible;
  }

  dispose(): void {
    this.scene?.remove(this.grid);
    this.scene?.remove(this.axes);
    this.grid.dispose();
    this.axes.dispose();
  }
}
