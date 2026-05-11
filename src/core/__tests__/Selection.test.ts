import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from '../EventEmitter';
import { Selection } from '../Selection';
import { asNodeUUID } from '../../utils/branded';

describe('Selection — UUID-based API', () => {
  let emitter: EventEmitter;
  let sel: Selection;

  beforeEach(() => {
    emitter = new EventEmitter();
    sel = new Selection(emitter);
  });

  // ── select() ─────────────────────────────────────────

  describe('select()', () => {
    it('select(uuid) stores uuid and emits selectionChanged', () => {
      const received: string[][] = [];
      emitter.on('selectionChanged', (uuids) => received.push([...uuids]));
      sel.select(asNodeUUID('uuid-a'));
      expect([...sel.all]).toEqual(['uuid-a']);
      expect(received).toEqual([['uuid-a']]);
    });

    it('select(uuid) replaces any existing selection', () => {
      sel.select(asNodeUUID('uuid-a'));
      const received: string[][] = [];
      emitter.on('selectionChanged', (uuids) => received.push([...uuids]));
      sel.select(asNodeUUID('uuid-b'));
      expect([...sel.all]).toEqual(['uuid-b']);
      expect(received).toEqual([['uuid-b']]);
    });

    it('select(same uuid) when already sole selection is a no-op', () => {
      sel.select(asNodeUUID('uuid-a'));
      let count = 0;
      emitter.on('selectionChanged', () => { count++; });
      sel.select(asNodeUUID('uuid-a'));
      expect(count).toBe(0);
    });

    it('select(null) clears selection and emits selectionChanged with []', () => {
      sel.select(asNodeUUID('uuid-a'));
      const received: string[][] = [];
      emitter.on('selectionChanged', (uuids) => received.push([...uuids]));
      sel.select(null);
      expect([...sel.all]).toEqual([]);
      expect(received).toEqual([[]]);
    });
  });

  // ── add() ─────────────────────────────────────────────

  describe('add()', () => {
    it('add() appends uuid to selection', () => {
      sel.add(asNodeUUID('uuid-a'));
      sel.add(asNodeUUID('uuid-b'));
      expect(sel.has(asNodeUUID('uuid-a'))).toBe(true);
      expect(sel.has(asNodeUUID('uuid-b'))).toBe(true);
    });

    it('add() emits selectionChanged with all current uuids', () => {
      sel.add(asNodeUUID('uuid-a'));
      const received: string[][] = [];
      emitter.on('selectionChanged', (uuids) => received.push([...uuids]));
      sel.add(asNodeUUID('uuid-b'));
      expect(received[0]).toContain('uuid-a');
      expect(received[0]).toContain('uuid-b');
    });

    it('add() duplicate is no-op — no event emitted', () => {
      sel.add(asNodeUUID('uuid-a'));
      let count = 0;
      emitter.on('selectionChanged', () => { count++; });
      sel.add(asNodeUUID('uuid-a'));
      expect(count).toBe(0);
    });
  });

  // ── remove() ──────────────────────────────────────────

  describe('remove()', () => {
    it('remove() deletes uuid and emits selectionChanged', () => {
      sel.add(asNodeUUID('uuid-a'));
      sel.add(asNodeUUID('uuid-b'));
      const received: string[][] = [];
      emitter.on('selectionChanged', (uuids) => received.push([...uuids]));
      sel.remove(asNodeUUID('uuid-a'));
      expect(sel.has(asNodeUUID('uuid-a'))).toBe(false);
      expect(received).toHaveLength(1);
    });

    it('remove() non-existent uuid is no-op — no event emitted', () => {
      let count = 0;
      emitter.on('selectionChanged', () => { count++; });
      sel.remove(asNodeUUID('not-here'));
      expect(count).toBe(0);
    });
  });

  // ── toggle() ──────────────────────────────────────────

  describe('toggle()', () => {
    it('toggle() adds uuid when not present', () => {
      sel.toggle(asNodeUUID('uuid-a'));
      expect(sel.has(asNodeUUID('uuid-a'))).toBe(true);
    });

    it('toggle() removes uuid when already present', () => {
      sel.add(asNodeUUID('uuid-a'));
      sel.toggle(asNodeUUID('uuid-a'));
      expect(sel.has(asNodeUUID('uuid-a'))).toBe(false);
    });

    it('toggle() emits selectionChanged each time', () => {
      let count = 0;
      emitter.on('selectionChanged', () => { count++; });
      sel.toggle(asNodeUUID('uuid-a')); // add
      sel.toggle(asNodeUUID('uuid-a')); // remove
      expect(count).toBe(2);
    });
  });

  // ── has() ─────────────────────────────────────────────

  describe('has()', () => {
    it('returns true for a selected uuid', () => {
      sel.select(asNodeUUID('uuid-a'));
      expect(sel.has(asNodeUUID('uuid-a'))).toBe(true);
    });

    it('returns false for an unselected uuid', () => {
      expect(sel.has(asNodeUUID('not-selected'))).toBe(false);
    });
  });

  // ── clear() ───────────────────────────────────────────

  describe('clear()', () => {
    it('clears all and emits selectionChanged with []', () => {
      sel.add(asNodeUUID('uuid-a'));
      sel.add(asNodeUUID('uuid-b'));
      const received: string[][] = [];
      emitter.on('selectionChanged', (uuids) => received.push([...uuids]));
      sel.clear();
      expect(sel.count).toBe(0);
      expect(received).toEqual([[]]);
    });

    it('clear() when empty is no-op — no event emitted', () => {
      let count = 0;
      emitter.on('selectionChanged', () => { count++; });
      sel.clear();
      expect(count).toBe(0);
    });
  });

  // ── primary ───────────────────────────────────────────

  describe('primary', () => {
    it('returns null when nothing is selected', () => {
      expect(sel.primary).toBeNull();
    });

    it('returns the last added uuid', () => {
      sel.add(asNodeUUID('uuid-a'));
      sel.add(asNodeUUID('uuid-b'));
      sel.add(asNodeUUID('uuid-c'));
      expect(sel.primary).toBe('uuid-c');
    });

    it('returns the uuid from select()', () => {
      sel.select(asNodeUUID('uuid-x'));
      expect(sel.primary).toBe('uuid-x');
    });
  });

  // ── hover() ───────────────────────────────────────────

  describe('hover()', () => {
    it('hover(uuid) sets hovered and emits hoverChanged', () => {
      const received: Array<string | null> = [];
      emitter.on('hoverChanged', (u) => received.push(u));
      sel.hover(asNodeUUID('uuid-a'));
      expect(sel.hovered).toBe('uuid-a');
      expect(received).toEqual(['uuid-a']);
    });

    it('hover(null) clears hovered and emits hoverChanged with null', () => {
      sel.hover(asNodeUUID('uuid-a'));
      const received: Array<string | null> = [];
      emitter.on('hoverChanged', (u) => received.push(u));
      sel.hover(null);
      expect(sel.hovered).toBeNull();
      expect(received).toEqual([null]);
    });

    it('hover with same uuid is no-op — no event emitted', () => {
      sel.hover(asNodeUUID('uuid-a'));
      let count = 0;
      emitter.on('hoverChanged', () => { count++; });
      sel.hover(asNodeUUID('uuid-a'));
      expect(count).toBe(0);
    });
  });

  // ── count / all ───────────────────────────────────────

  describe('count and all', () => {
    it('count is 0 initially', () => {
      expect(sel.count).toBe(0);
    });

    it('count reflects number of selected uuids', () => {
      sel.add(asNodeUUID('uuid-a'));
      sel.add(asNodeUUID('uuid-b'));
      expect(sel.count).toBe(2);
    });

    it('all returns empty array initially', () => {
      expect([...sel.all]).toEqual([]);
    });
  });

  // ── selectionChanged payload type ─────────────────────

  describe('selectionChanged payload', () => {
    it('payload is string[] not Object3D[]', () => {
      const received: unknown[] = [];
      emitter.on('selectionChanged', (uuids) => received.push(uuids));
      sel.select(asNodeUUID('some-uuid'));
      expect(Array.isArray(received[0])).toBe(true);
      expect(typeof (received[0] as string[])[0]).toBe('string');
    });
  });

  // ── hoverChanged payload type ─────────────────────────

  describe('hoverChanged payload', () => {
    it('payload is string when hovering', () => {
      const received: unknown[] = [];
      emitter.on('hoverChanged', (u) => received.push(u));
      sel.hover(asNodeUUID('uuid-hover'));
      expect(typeof received[0]).toBe('string');
    });

    it('payload is null when hover cleared', () => {
      sel.hover(asNodeUUID('uuid-hover'));
      const received: unknown[] = [];
      emitter.on('hoverChanged', (u) => received.push(u));
      sel.hover(null);
      expect(received[0]).toBeNull();
    });
  });
});
