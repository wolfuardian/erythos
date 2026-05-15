import { describe, it, expect, vi } from 'vitest';
import { Clipboard } from '../Clipboard';
import type { SceneNode } from '../scene/SceneFormat';
import { asNodeUUID } from '../../utils/branded';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(id: string, parent: string | null = null): SceneNode {
  return {
    id: asNodeUUID(id),
    name: id,
    parent: parent !== null ? asNodeUUID(parent) : null,
    order: 0,
    nodeType: 'group',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    userData: {},
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Clipboard', () => {
  describe('initial state', () => {
    it('starts empty', () => {
      const cb = new Clipboard();
      expect(cb.hasContent).toBe(false);
      expect(cb.mode).toBeNull();
    });

    it('paste() returns null when empty', () => {
      const cb = new Clipboard();
      expect(cb.paste()).toBeNull();
    });
  });

  describe('copy', () => {
    it('hasContent becomes true after copy', () => {
      const cb = new Clipboard();
      cb.copy([makeNode('a')]);
      expect(cb.hasContent).toBe(true);
      expect(cb.mode).toBe('copy');
    });

    it('paste() after copy returns deep-cloned nodes with new UUIDs', () => {
      const cb = new Clipboard();
      const original = makeNode('original-uuid');
      cb.copy([original]);

      const result = cb.paste();
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      // New UUID assigned — must differ from original
      expect(result![0].id).not.toBe('original-uuid');
      expect(result![0].name).toBe('original-uuid'); // name preserved
    });

    it('paste() after copy does not clear clipboard (copy is persistent)', () => {
      const cb = new Clipboard();
      cb.copy([makeNode('a')]);
      cb.paste();
      cb.paste(); // second paste still works
      expect(cb.hasContent).toBe(true);
      expect(cb.mode).toBe('copy');
    });

    it('copy is a deep clone — mutating original does not affect pasted result', () => {
      const cb = new Clipboard();
      const node = makeNode('a');
      cb.copy([node]);
      node.name = 'mutated';
      const result = cb.paste();
      expect(result![0].name).toBe('a'); // original name preserved
    });
  });

  describe('cut', () => {
    it('hasContent becomes true and mode is cut', () => {
      const cb = new Clipboard();
      cb.cut([makeNode('a')]);
      expect(cb.hasContent).toBe(true);
      expect(cb.mode).toBe('cut');
    });

    it('paste() after cut returns cloned nodes with new UUIDs', () => {
      const cb = new Clipboard();
      cb.cut([makeNode('cut-uuid')]);
      const result = cb.paste();
      expect(result).not.toBeNull();
      expect(result![0].id).not.toBe('cut-uuid');
    });

    it('paste() after cut clears clipboard (cut is one-shot)', () => {
      const cb = new Clipboard();
      cb.cut([makeNode('a')]);
      cb.paste();
      expect(cb.hasContent).toBe(false);
      expect(cb.mode).toBeNull();
      expect(cb.paste()).toBeNull();
    });
  });

  describe('UUID remapping on paste', () => {
    it('remaps parent references within the cloned set', () => {
      const cb = new Clipboard();
      const parent = makeNode('p');
      const child = makeNode('c', 'p');
      cb.copy([parent, child]);

      const result = cb.paste()!;
      const pastedParent = result.find(n => n.name === 'p')!;
      const pastedChild  = result.find(n => n.name === 'c')!;

      // Parent ID changed
      expect(pastedParent.id).not.toBe('p');
      // Child's parent reference updated to the new parent ID
      expect(pastedChild.parent).toBe(pastedParent.id);
    });

    it('sets parent to null for nodes whose parent is not in the cloned set', () => {
      const cb = new Clipboard();
      // Only copy the child — parent not in clipboard
      const child = makeNode('c', 'external-parent');
      cb.copy([child]);

      const result = cb.paste()!;
      expect(result[0].parent).toBeNull();
    });
  });

  describe('clipboardChanged event', () => {
    it('emits on copy', () => {
      const cb = new Clipboard();
      const listener = vi.fn();
      cb.on('clipboardChanged', listener);
      cb.copy([makeNode('a')]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits on cut', () => {
      const cb = new Clipboard();
      const listener = vi.fn();
      cb.on('clipboardChanged', listener);
      cb.cut([makeNode('a')]);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits on paste', () => {
      const cb = new Clipboard();
      const listener = vi.fn();
      cb.copy([makeNode('a')]);
      cb.on('clipboardChanged', listener);
      cb.paste();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('off() stops receiving events', () => {
      const cb = new Clipboard();
      const listener = vi.fn();
      cb.on('clipboardChanged', listener);
      cb.off('clipboardChanged', listener);
      cb.copy([makeNode('a')]);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
