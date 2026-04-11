import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Object3D } from 'three';
import { EventEmitter } from '../EventEmitter';
import { Editor } from '../Editor';

// ── Unit tests: new UUID-based events ────────────────────────────────────────

describe('EventEmitter — new UUID-based events', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it('nodeAdded: on receives the emitted uuid', () => {
    const received: string[] = [];
    emitter.on('nodeAdded', (uuid) => received.push(uuid));
    emitter.emit('nodeAdded', 'abc-123');
    expect(received).toEqual(['abc-123']);
  });

  it('nodeRemoved: on receives the emitted uuid', () => {
    const received: string[] = [];
    emitter.on('nodeRemoved', (uuid) => received.push(uuid));
    emitter.emit('nodeRemoved', 'def-456');
    expect(received).toEqual(['def-456']);
  });

  it('nodeChanged: on receives the emitted uuid', () => {
    // No caller in Editor yet (added to EventMap only; caller arrives in V2-2)
    const received: string[] = [];
    emitter.on('nodeChanged', (uuid) => received.push(uuid));
    emitter.emit('nodeChanged', 'ghi-789');
    expect(received).toEqual(['ghi-789']);
  });

  it('sceneReplaced: on is called with no payload', () => {
    let called = false;
    emitter.on('sceneReplaced', () => { called = true; });
    emitter.emit('sceneReplaced');
    expect(called).toBe(true);
  });

  it('hoverChanged: on receives uuid string', () => {
    const received: Array<string | null> = [];
    emitter.on('hoverChanged', (uuid) => received.push(uuid));
    emitter.emit('hoverChanged', 'jkl-000');
    expect(received).toEqual(['jkl-000']);
  });

  it('hoverChanged: on receives null when hover is cleared', () => {
    const received: Array<string | null> = [];
    emitter.on('hoverChanged', (uuid) => received.push(uuid));
    emitter.emit('hoverChanged', null);
    expect(received).toEqual([null]);
  });
});

// ── Integration: Editor emits new events ─────────────────────────────────────

describe('Editor — emits UUID-based events', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor();
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('addNode emits nodeAdded with node.id', () => {
    const node = editor.sceneDocument.createNode('Cube');
    const received: string[] = [];
    editor.events.on('nodeAdded', (uuid) => received.push(uuid));
    editor.addNode(node);
    expect(received).toEqual([node.id]);
  });

  it('removeNode emits nodeRemoved with the uuid', () => {
    const node = editor.sceneDocument.createNode('Cube');
    editor.addNode(node);
    const received: string[] = [];
    editor.events.on('nodeRemoved', (uuid) => received.push(uuid));
    editor.removeNode(node.id);
    expect(received).toEqual([node.id]);
  });

  it('clear() emits sceneReplaced', () => {
    let called = false;
    editor.events.on('sceneReplaced', () => { called = true; });
    editor.clear();
    expect(called).toBe(true);
  });
});

// ── Integration: Selection emits hoverChanged ────────────────────────────────

describe('Selection — emits hoverChanged', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor();
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('hover(obj) emits hoverChanged with obj.uuid', () => {
    const obj = new Object3D();
    const received: Array<string | null> = [];
    editor.events.on('hoverChanged', (uuid) => received.push(uuid));
    editor.selection.hover(obj);
    expect(received).toEqual([obj.uuid]);
  });

  it('hover(null) emits hoverChanged with null', () => {
    const obj = new Object3D();
    editor.selection.hover(obj); // set first

    const received: Array<string | null> = [];
    editor.events.on('hoverChanged', (uuid) => received.push(uuid));
    editor.selection.hover(null);
    expect(received).toEqual([null]);
  });

  it('hover with same object does not emit again', () => {
    const obj = new Object3D();
    editor.selection.hover(obj);
    let count = 0;
    editor.events.on('hoverChanged', () => { count++; });
    editor.selection.hover(obj); // same — no-op
    expect(count).toBe(0);
  });
});

// ── Backward compat: deprecated legacy events still fire ─────────────────────

describe('EventEmitter — deprecated legacy events still work', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor();
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('objectAdded still fires via addObject (legacy path)', () => {
    const obj = new Object3D();
    let fired = false;
    editor.events.on('objectAdded', () => { fired = true; });
    editor.addObject(obj);
    expect(fired).toBe(true);
  });

  it('objectRemoved still fires via removeObject (legacy path)', () => {
    const obj = new Object3D();
    editor.addObject(obj);
    let fired = false;
    editor.events.on('objectRemoved', () => { fired = true; });
    editor.removeObject(obj);
    expect(fired).toBe(true);
  });

  it('sceneGraphChanged still fires via addObject (legacy path)', () => {
    const obj = new Object3D();
    let fired = false;
    editor.events.on('sceneGraphChanged', () => { fired = true; });
    editor.addObject(obj);
    expect(fired).toBe(true);
  });

  it('objectHovered still fires via selection.hover (legacy path)', () => {
    const obj = new Object3D();
    let received: Object3D | null = null;
    editor.events.on('objectHovered', (o) => { received = o; });
    editor.selection.hover(obj);
    expect(received).toBe(obj);
  });

  it('objectSelected still fires via selection.select (legacy path)', () => {
    const obj = new Object3D();
    let received: Object3D | null | undefined = undefined;
    editor.events.on('objectSelected', (o) => { received = o; });
    editor.selection.select(obj);
    expect(received).toBe(obj);
  });
});
