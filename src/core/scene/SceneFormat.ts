export type Vec3 = [number, number, number];

export interface SceneNode {
  id: string;          // UUID v4
  name: string;
  parent: string | null; // parent UUID
  order: number;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  components: Record<string, unknown>;
  userData: Record<string, unknown>;
}

export interface MeshComponent {
  source: string;
}

export interface SceneFile {
  version: number;
  nodes: SceneNode[];
}
