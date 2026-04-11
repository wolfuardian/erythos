export interface SceneMetadata {
  name: string;
  createdAt: string;
}

export interface SceneFormat {
  version: number;
  metadata: SceneMetadata;
  /** Scene object data — structure TBD in a future issue */
  objects: unknown[];
}
