import type { Object3D } from 'three';
import type { EventEmitter, InteractionMode } from './EventEmitter';

export class Selection {
  private _selected: Object3D | null = null;
  private _hovered: Object3D | null = null;
  private _mode: InteractionMode = 'object';
  private events: EventEmitter;

  constructor(events: EventEmitter) {
    this.events = events;
  }

  get selected(): Object3D | null { return this._selected; }
  get hovered(): Object3D | null { return this._hovered; }
  get mode(): InteractionMode { return this._mode; }

  select(object: Object3D | null): void {
    if (this._selected === object) return;
    this._selected = object;
    this.events.emit('objectSelected', object);
  }

  hover(object: Object3D | null): void {
    if (this._hovered === object) return;
    this._hovered = object;
    this.events.emit('objectHovered', object);
  }

  setMode(mode: InteractionMode): void {
    if (this._mode === mode) return;
    this._mode = mode;
    this.events.emit('interactionModeChanged', mode);
  }

  clear(): void {
    this.select(null);
    this.hover(null);
  }
}
