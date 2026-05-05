import type { AssetPath } from '../../utils/branded';

export interface ProjectFile {
  path: AssetPath; // e.g. 'prefabs/chair.prefab'
  name: string; // e.g. 'chair.prefab'
  type: 'glb' | 'prefab' | 'hdr' | 'scene' | 'texture' | 'other';
}

export function inferFileType(name: string): ProjectFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'glb':
    case 'gltf':
      return 'glb';
    case 'leaf':    // legacy alias：舊 user project 的 .leaf 仍可讀
    case 'prefab':
      return 'prefab';
    case 'hdr':
      return 'hdr';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return 'texture';
    case 'erythos':
      return 'scene';
    default:
      return 'other';
  }
}
