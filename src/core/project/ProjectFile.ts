export interface ProjectFile {
  path: string; // e.g. 'models/chair.glb'
  name: string; // e.g. 'chair.glb'
  type: 'glb' | 'leaf' | 'hdr' | 'scene' | 'texture' | 'other';
}

export function inferFileType(name: string): ProjectFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'glb':
    case 'gltf':
      return 'glb';
    case 'leaf':
      return 'leaf';
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
