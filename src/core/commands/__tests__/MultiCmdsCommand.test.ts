/**
 * MultiCmdsCommand unit tests
 *
 * Uses a minimal stub Editor (only passes to super(); never read by MultiCmdsCommand).
 * Uses stub commands with vi.fn() to verify execute/undo call order and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiCmdsCommand } from '../MultiCmdsCommand';
import { Command } from '../../Command';
import type { Editor } from '../../Editor';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal editor stub — MultiCmdsCommand only passes it to super(). */
const STUB_EDITOR = {} as Editor;

/** Concrete stub command with trackable execute/undo. */
class StubCommand extends Command {
  readonly type = 'Stub';
  execute = vi.fn();
  undo = vi.fn();
  constructor() { super(STUB_EDITOR); }
}

function makeStubs(n: number): StubCommand[] {
  return Array.from({ length: n }, () => new StubCommand());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MultiCmdsCommand', () => {
  describe('type', () => {
    it('has type "MultiCmds"', () => {
      const cmd = new MultiCmdsCommand(STUB_EDITOR, []);
      expect(cmd.type).toBe('MultiCmds');
    });
  });

  describe('empty batch', () => {
    it('execute() on empty batch does not throw', () => {
      const cmd = new MultiCmdsCommand(STUB_EDITOR, []);
      expect(() => cmd.execute()).not.toThrow();
    });

    it('undo() on empty batch does not throw', () => {
      const cmd = new MultiCmdsCommand(STUB_EDITOR, []);
      expect(() => cmd.undo()).not.toThrow();
    });
  });

  describe('execute', () => {
    it('calls execute on all commands', () => {
      const stubs = makeStubs(3);
      const cmd = new MultiCmdsCommand(STUB_EDITOR, stubs);
      cmd.execute();
      for (const s of stubs) {
        expect(s.execute).toHaveBeenCalledTimes(1);
      }
    });

    it('calls execute in forward order (0 → 1 → 2)', () => {
      const order: number[] = [];
      const stubs = makeStubs(3);
      stubs[0].execute.mockImplementation(() => order.push(0));
      stubs[1].execute.mockImplementation(() => order.push(1));
      stubs[2].execute.mockImplementation(() => order.push(2));

      new MultiCmdsCommand(STUB_EDITOR, stubs).execute();
      expect(order).toEqual([0, 1, 2]);
    });

    it('propagates exception from a failing sub-command', () => {
      const stubs = makeStubs(3);
      stubs[1].execute.mockImplementation(() => { throw new Error('cmd1 failed'); });
      const cmd = new MultiCmdsCommand(STUB_EDITOR, stubs);
      expect(() => cmd.execute()).toThrow('cmd1 failed');
    });

    it('when cmd[1] throws, cmd[0] already ran and cmd[2] did not (no rollback)', () => {
      const stubs = makeStubs(3);
      stubs[1].execute.mockImplementation(() => { throw new Error('boom'); });
      const cmd = new MultiCmdsCommand(STUB_EDITOR, stubs);
      try { cmd.execute(); } catch { /* expected */ }
      expect(stubs[0].execute).toHaveBeenCalledTimes(1);  // already applied
      expect(stubs[2].execute).not.toHaveBeenCalled();    // never reached
    });
  });

  describe('undo', () => {
    it('calls undo on all commands', () => {
      const stubs = makeStubs(3);
      const cmd = new MultiCmdsCommand(STUB_EDITOR, stubs);
      cmd.undo();
      for (const s of stubs) {
        expect(s.undo).toHaveBeenCalledTimes(1);
      }
    });

    it('calls undo in reverse order (2 → 1 → 0)', () => {
      const order: number[] = [];
      const stubs = makeStubs(3);
      stubs[0].undo.mockImplementation(() => order.push(0));
      stubs[1].undo.mockImplementation(() => order.push(1));
      stubs[2].undo.mockImplementation(() => order.push(2));

      new MultiCmdsCommand(STUB_EDITOR, stubs).undo();
      expect(order).toEqual([2, 1, 0]);
    });

    it('execute then undo produces balanced call counts', () => {
      const stubs = makeStubs(2);
      const cmd = new MultiCmdsCommand(STUB_EDITOR, stubs);
      cmd.execute();
      cmd.undo();
      for (const s of stubs) {
        expect(s.execute).toHaveBeenCalledTimes(1);
        expect(s.undo).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('single command batch', () => {
    it('execute delegates to the single command', () => {
      const [s] = makeStubs(1);
      new MultiCmdsCommand(STUB_EDITOR, [s]).execute();
      expect(s.execute).toHaveBeenCalledTimes(1);
    });

    it('undo delegates to the single command', () => {
      const [s] = makeStubs(1);
      new MultiCmdsCommand(STUB_EDITOR, [s]).undo();
      expect(s.undo).toHaveBeenCalledTimes(1);
    });
  });
});
