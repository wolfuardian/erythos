/**
 * AnonMigrateDialog.test.tsx
 *
 * Unit tests for the Anonymous → Registered migration modal.
 *
 * Refs: #1054
 */

import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnonMigrateDialog } from '../AnonMigrateDialog';
import type { ProjectEntry } from '../../core/project/ProjectHandleStore';

afterEach(cleanup);

function makeEntry(id: string, name: string, lastOpened = 1747123200000): ProjectEntry {
  return {
    id,
    name,
    handle: {} as FileSystemDirectoryHandle,
    lastOpened,
  };
}

const ENTRIES: ProjectEntry[] = [
  makeEntry('id-1', 'Scene Alpha', 1747123200000),
  makeEntry('id-2', 'Scene Beta', 1747036800000),
];

// ── Visibility ────────────────────────────────────────────────────────────────

describe('visibility', () => {
  it('does not render when open=false', () => {
    render(() => (
      <AnonMigrateDialog
        open={false}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    expect(screen.queryByTestId('anon-migrate-dialog')).toBeNull();
  });

  it('renders when open=true', () => {
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    expect(screen.getByTestId('anon-migrate-dialog')).toBeTruthy();
  });

  it('title text is shown', () => {
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    expect(screen.getByTestId('anon-migrate-dialog-title').textContent).toContain(
      'Add your local projects to your account?',
    );
  });

  it('open signal drives visibility reactively', () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <AnonMigrateDialog
        open={open()}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    expect(screen.queryByTestId('anon-migrate-dialog')).toBeNull();
    setOpen(true);
    expect(screen.getByTestId('anon-migrate-dialog')).toBeTruthy();
    setOpen(false);
    expect(screen.queryByTestId('anon-migrate-dialog')).toBeNull();
  });
});

// ── Entry list ────────────────────────────────────────────────────────────────

describe('entry list', () => {
  beforeEach(() => {
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
  });

  it('renders all entry checkboxes', () => {
    expect(screen.getByTestId('anon-migrate-entry-id-1')).toBeTruthy();
    expect(screen.getByTestId('anon-migrate-entry-id-2')).toBeTruthy();
  });

  it('all entries are checked by default', () => {
    const cb1 = screen.getByTestId('anon-migrate-entry-id-1') as HTMLInputElement;
    const cb2 = screen.getByTestId('anon-migrate-entry-id-2') as HTMLInputElement;
    expect(cb1.checked).toBe(true);
    expect(cb2.checked).toBe(true);
  });

  it('entry name is visible', () => {
    const list = screen.getByTestId('anon-migrate-entry-list');
    expect(list.textContent).toContain('Scene Alpha');
    expect(list.textContent).toContain('Scene Beta');
  });

  it('toggling a checkbox unchecks it', () => {
    const cb1 = screen.getByTestId('anon-migrate-entry-id-1') as HTMLInputElement;
    fireEvent.change(cb1);
    expect(cb1.checked).toBe(false);
  });

  it('toggling unchecked checkbox re-checks it', () => {
    const cb1 = screen.getByTestId('anon-migrate-entry-id-1') as HTMLInputElement;
    fireEvent.change(cb1); // uncheck
    fireEvent.change(cb1); // re-check
    expect(cb1.checked).toBe(true);
  });
});

// ── Select all / Clear ────────────────────────────────────────────────────────

describe('select all / clear', () => {
  it('"Clear" unchecks all entries', () => {
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByTestId('anon-migrate-clear'));
    const cb1 = screen.getByTestId('anon-migrate-entry-id-1') as HTMLInputElement;
    const cb2 = screen.getByTestId('anon-migrate-entry-id-2') as HTMLInputElement;
    expect(cb1.checked).toBe(false);
    expect(cb2.checked).toBe(false);
  });

  it('"Select all" re-checks all entries after clear', () => {
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByTestId('anon-migrate-clear'));
    fireEvent.click(screen.getByTestId('anon-migrate-select-all'));
    const cb1 = screen.getByTestId('anon-migrate-entry-id-1') as HTMLInputElement;
    const cb2 = screen.getByTestId('anon-migrate-entry-id-2') as HTMLInputElement;
    expect(cb1.checked).toBe(true);
    expect(cb2.checked).toBe(true);
  });
});

// ── Action buttons ────────────────────────────────────────────────────────────

describe('action buttons', () => {
  it('"Add selected" calls onAddSelected with selected IDs', () => {
    const onAddSelected = vi.fn();
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={onAddSelected}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    // Uncheck id-2
    fireEvent.change(screen.getByTestId('anon-migrate-entry-id-2'));
    fireEvent.click(screen.getByTestId('anon-migrate-add'));
    expect(onAddSelected).toHaveBeenCalledWith(['id-1']);
  });

  it('"Add selected" is disabled when nothing is selected', () => {
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByTestId('anon-migrate-clear'));
    const btn = screen.getByTestId('anon-migrate-add') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('"Skip" calls onSkip', () => {
    const onSkip = vi.fn();
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={onSkip}
        onSkipAll={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByTestId('anon-migrate-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('"Skip all" calls onSkipAll', () => {
    const onSkipAll = vi.fn();
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={vi.fn()}
        onSkipAll={onSkipAll}
      />
    ));
    fireEvent.click(screen.getByTestId('anon-migrate-skip-all'));
    expect(onSkipAll).toHaveBeenCalledOnce();
  });

  it('overlay click calls onSkip', () => {
    const onSkip = vi.fn();
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={onSkip}
        onSkipAll={vi.fn()}
      />
    ));
    fireEvent.click(screen.getByTestId('anon-migrate-dialog'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('Escape key calls onSkip', () => {
    const onSkip = vi.fn();
    render(() => (
      <AnonMigrateDialog
        open={true}
        entries={ENTRIES}
        onAddSelected={vi.fn()}
        onSkip={onSkip}
        onSkipAll={vi.fn()}
      />
    ));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
