import type { Component } from 'solid-js';
import type { ProjectFile } from '../../core/project/ProjectFile';

// SVG inner fragments only (no <svg> wrapper) — caller controls size / stroke / fill.
// viewBox 0 0 16 16, fill:none, stroke-linecap:round, stroke-linejoin:round.
export const ProjectTypeIcon: Component<{ type: ProjectFile['type'] }> = (props) => {
  switch (props.type) {
    case 'scene':   return <><path d="M8 3L3 6v5l5 3 5-3V6L8 3z"/><line x1="8" y1="3" x2="8" y2="14"/><line x1="3" y1="6" x2="13" y2="6"/></>;
    case 'glb':     return <><path d="M8 2l5 3v5l-5 3-5-3V5z"/><line x1="8" y1="2" x2="8" y2="10"/><line x1="3" y1="5" x2="13" y2="10"/></>;
    case 'texture': return <><rect x="2" y="2" width="12" height="12" rx="1"/><rect x="2" y="2" width="6" height="6"/><rect x="8" y="8" width="6" height="6"/></>;
    case 'hdr':     return <><circle cx="8" cy="8" r="5"/><line x1="3" y1="8" x2="13" y2="8"/><path d="M5.5 5a5 5 0 0 0 0 6"/><path d="M10.5 5a5 5 0 0 1 0 6"/></>;
    case 'prefab':  return <><path d="M4 13c0 0 1-7 7-9"/><path d="M4 13c3-1 8-4 7-9"/><line x1="4" y1="13" x2="8" y2="9"/></>;
    case 'other':   return <><rect x="3" y="2" width="8" height="11" rx="1"/><line x1="3" y1="7" x2="11" y2="7"/><text x="7" y="12" text-anchor="middle" font-size="5" stroke="none" fill="currentColor">?</text></>;
  }
};
