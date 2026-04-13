import type { SceneNode, GeometryComponent, LightComponent } from './SceneFormat';

export type NodeType =
  | 'Mesh'
  | 'Box' | 'Sphere' | 'Plane' | 'Cylinder'
  | 'DirectionalLight' | 'AmbientLight'
  | 'PerspectiveCamera'
  | 'Group';

export function inferNodeType(node: SceneNode): NodeType {
  const { components } = node;

  if (components.mesh) return 'Mesh';

  if (components.geometry) {
    const geo = components.geometry as GeometryComponent;
    switch (geo.type) {
      case 'box':      return 'Box';
      case 'sphere':   return 'Sphere';
      case 'plane':    return 'Plane';
      case 'cylinder': return 'Cylinder';
    }
  }

  if (components.light) {
    const light = components.light as LightComponent;
    switch (light.type) {
      case 'directional': return 'DirectionalLight';
      case 'ambient':     return 'AmbientLight';
    }
  }

  if (components.camera) return 'PerspectiveCamera';

  return 'Group';
}
