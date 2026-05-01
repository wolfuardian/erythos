import type { Component } from 'solid-js';

// ── Type Icons ───────────────────────────────────────────────────────────────
// Each icon accepts a `color` prop (defaults to appropriate badge var).
// Stroke/fill uses the provided color so the row context can apply theme vars.

interface IconProps {
  color?: string;
  size?: number;
}

export const MeshIcon: Component<IconProps> = (props) => {
  const c = () => props.color ?? 'var(--badge-mesh)';
  const s = () => props.size ?? 13;
  return (
    <svg width={s()} height={s()} viewBox="0 0 13 13" fill="none">
      <rect x="2" y="2.5" width="9" height="8" rx="1" stroke={c()} stroke-width="1.1"/>
      <path d="M2 5.5h9M2 8.5h9M5 2.5v8M8 2.5v3" stroke={c()} stroke-width="0.7"/>
    </svg>
  );
};

export const LightIcon: Component<IconProps> = (props) => {
  const c = () => props.color ?? 'var(--badge-light)';
  const s = () => props.size ?? 13;
  return (
    <svg width={s()} height={s()} viewBox="0 0 13 13" fill="none">
      <circle cx="6.5" cy="6.5" r="2.2" stroke={c()} stroke-width="1.1"/>
      <path d="M6.5 1.5v1.5M6.5 9.5v1.5M1.5 6.5H3M10 6.5h1.5M3 3l1 1M9 9l1 1M3 10l1-1M9 4l1-1" stroke={c()} stroke-width="1" stroke-linecap="round"/>
    </svg>
  );
};

export const CameraIcon: Component<IconProps> = (props) => {
  const c = () => props.color ?? 'var(--badge-camera)';
  const s = () => props.size ?? 13;
  return (
    <svg width={s()} height={s()} viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="4" width="8" height="6" rx="1" stroke={c()} stroke-width="1.1"/>
      <circle cx="10.5" cy="7" r="1.5" stroke={c()} stroke-width="1"/>
      <circle cx="5.5" cy="7" r="1.8" stroke={c()} stroke-width="1"/>
    </svg>
  );
};

export const GroupIcon: Component<IconProps> = (props) => {
  const c = () => props.color ?? 'var(--badge-group)';
  const s = () => props.size ?? 13;
  return (
    <svg width={s()} height={s()} viewBox="0 0 13 13" fill="none">
      <path d="M2 5l4.5-3L11 5v5l-4.5 2.5L2 10z" stroke={c()} stroke-width="1.1"/>
      <path d="M6.5 2.5v10M2 5l4.5 2.5L11 5" stroke={c()} stroke-width="0.9"/>
    </svg>
  );
};

// ── Toggle Icons ─────────────────────────────────────────────────────────────

export const EyeOnIcon: Component = () => (
  <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
    <ellipse cx="6.5" cy="5" rx="5" ry="3.5" stroke="currentColor" stroke-width="1.1"/>
    <circle cx="6.5" cy="5" r="1.6" fill="currentColor"/>
  </svg>
);

export const EyeOffIcon: Component = () => (
  <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
    <path d="M1.5 5C3 2.5 10 2.5 11.5 5" stroke="currentColor" stroke-width="1.1"/>
    <path d="M1.5 9.5l10-8" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  </svg>
);

export const CursorOnIcon: Component = () => (
  <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
    <path d="M2 1.5l7 5-3.5 1L7 11l-1.5.5-1.5-3.5L1.5 9.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none"/>
  </svg>
);

export const CursorOffIcon: Component = () => (
  <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
    <path d="M2 1.5l7 5-3.5 1L7 11l-1.5.5-1.5-3.5L1.5 9.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" fill="none" opacity="0.5"/>
    <path d="M1.5 10.5l8-9" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
  </svg>
);

// ── Node type → icon mapping ─────────────────────────────────────────────────
// Maps the 9 inferNodeType values down to 4 icon categories.

import type { NodeType } from '../../core/scene/inferNodeType';

export function nodeTypeToIcon(type: NodeType): Component<IconProps> {
  switch (type) {
    case 'Mesh':
    case 'Box':
    case 'Sphere':
    case 'Plane':
    case 'Cylinder':
      return MeshIcon;
    case 'DirectionalLight':
    case 'AmbientLight':
      return LightIcon;
    case 'PerspectiveCamera':
      return CameraIcon;
    case 'Group':
    default:
      return GroupIcon;
  }
}

export function nodeTypeColor(type: NodeType): string {
  switch (type) {
    case 'Mesh':
    case 'Box':
    case 'Sphere':
    case 'Plane':
    case 'Cylinder':
      return 'var(--badge-mesh)';
    case 'DirectionalLight':
    case 'AmbientLight':
      return 'var(--badge-light)';
    case 'PerspectiveCamera':
      return 'var(--badge-camera)';
    case 'Group':
    default:
      return 'var(--badge-group)';
  }
}
