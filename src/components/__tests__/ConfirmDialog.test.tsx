/**
 * ConfirmDialog.test.tsx
 *
 * Sample component test proving the SolidJS testing harness works.
 * ConfirmDialog is a pure component with no bridge/core dependencies.
 */
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../ConfirmDialog';

afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('does not render when open=false', () => {
    render(() => (
      <ConfirmDialog
        open={false}
        title="Test"
        message="Test message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    ));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });

  it('renders title and message when open=true', () => {
    render(() => (
      <ConfirmDialog
        open={true}
        title="Delete?"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    ));
    expect(screen.getByTestId('confirm-dialog-title').textContent).toBe('Delete?');
    expect(screen.getByTestId('confirm-dialog-message').textContent).toBe('This cannot be undone.');
  });

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape key pressed', () => {
    const onCancel = vi.fn();
    render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    ));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onCancel when overlay (backdrop) clicked', () => {
    const onCancel = vi.fn();
    render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    ));
    // The overlay div (data-testid="confirm-dialog") calls onCancel on click
    fireEvent.click(screen.getByTestId('confirm-dialog'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('uses custom confirmLabel and cancelLabel', () => {
    render(() => (
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Message"
        confirmLabel="Yes, delete"
        cancelLabel="No, keep"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    ));
    expect(screen.getByTestId('confirm-dialog-confirm').textContent).toBe('Yes, delete');
    expect(screen.getByTestId('confirm-dialog-cancel').textContent).toBe('No, keep');
  });

  it('open signal drives visibility reactively', () => {
    const [open, setOpen] = createSignal(false);
    render(() => (
      <ConfirmDialog
        open={open()}
        title="Dynamic"
        message="Msg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    ));
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    setOpen(true);
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    setOpen(false);
    expect(screen.queryByTestId('confirm-dialog')).toBeNull();
  });
});
