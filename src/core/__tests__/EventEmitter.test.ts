import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from '../EventEmitter';
import { Editor } from '../Editor';
import { ProjectManager } from '../project/ProjectManager';
import { asNodeUUID } from '../../utils/branded';

// ── Unit tests: new UUID-based events ────────────────────────────────────────

describe('EventEmitter — new UUID-based events', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  it('nodeAdded: on receives the emitted uuid', () => {
    const received: string[] = [];
    emitter.on('nodeAdded', (uuid) => received.push(uuid));
    emitter.emit('nodeAdded', asNodeUUID('abc-123'));
    expect(received).toEqual(['abc-123']);
  });

  it('nodeRemoved: on receives the emitted uuid', () => {
    const received: string[] = [];
    emitter.on('nodeRemoved', (uuid) => received.push(uuid));
    emitter.emit('nodeRemoved', asNodeUUID('def-456'));
    expect(received).toEqual(['def-456']);
  });

  it('hoverChanged: on receives uuid string', () => {
    const received: Array<string | null> = [];
    emitter.on('hoverChanged', (uuid) => received.push(uuid));
    emitter.emit('hoverChanged', asNodeUUID('jkl-000'));
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
    editor = new Editor(new ProjectManager());
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
});

// ── Integration: Selection emits hoverChanged ────────────────────────────────

describe('Selection — emits hoverChanged', () => {
  let editor: Editor;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    editor = new Editor(new ProjectManager());
  });

  afterEach(() => {
    editor.dispose();
    vi.useRealTimers();
  });

  it('hover(uuid) emits hoverChanged with that uuid', () => {
    const uuid = asNodeUUID('test-uuid-hover-1');
    const received: Array<string | null> = [];
    editor.events.on('hoverChanged', (u) => received.push(u));
    editor.selection.hover(uuid);
    expect(received).toEqual([uuid]);
  });

  it('hover(null) emits hoverChanged with null', () => {
    editor.selection.hover(asNodeUUID('some-uuid'));

    const received: Array<string | null> = [];
    editor.events.on('hoverChanged', (u) => received.push(u));
    editor.selection.hover(null);
    expect(received).toEqual([null]);
  });

  it('hover with same uuid does not emit again', () => {
    const uuid = asNodeUUID('test-uuid-hover-2');
    editor.selection.hover(uuid);
    let count = 0;
    editor.events.on('hoverChanged', () => { count++; });
    editor.selection.hover(uuid); // same — no-op
    expect(count).toBe(0);
  });
});

