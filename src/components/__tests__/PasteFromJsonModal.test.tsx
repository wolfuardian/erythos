/**
 * PasteFromJsonModal.test.tsx
 *
 * Tests for the Paste from JSON modal component.
 * Covers: open/close, clipboard pre-populate, import callback, cancel.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasteFromJsonModal } from '../PasteFromJsonModal';

afterEach(cleanup);

const SAMPLE_JSON = '{\n  "version": 2,\n  "nodes": []\n}';

describe('PasteFromJsonModal', () => {
  it('does not render when open=false', () => {
    render(() => (
      <PasteFromJsonModal open={false} onImport={vi.fn()} onClose={vi.fn()} />
    ));
    expect(screen.queryByTestId('paste-from-json-modal')).toBeNull();
  });

  it('renders dialog when open=true', () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('') },
    });
    render(() => (
      <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={vi.fn()} />
    ));
    expect(screen.getByTestId('paste-from-json-modal')).toBeTruthy();
    expect(screen.getByTestId('paste-from-json-dialog')).toBeTruthy();
    expect(screen.getByTestId('paste-from-json-textarea')).toBeTruthy();
    expect(screen.getByTestId('paste-from-json-import')).toBeTruthy();
    expect(screen.getByTestId('paste-from-json-cancel')).toBeTruthy();
  });

  it('calls onClose when Escape key pressed', () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('') },
    });
    const onClose = vi.fn();
    render(() => (
      <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={onClose} />
    ));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay (backdrop) clicked', () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('') },
    });
    const onClose = vi.fn();
    render(() => (
      <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={onClose} />
    ));
    fireEvent.click(screen.getByTestId('paste-from-json-modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose when dialog inner area clicked', () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('') },
    });
    const onClose = vi.fn();
    render(() => (
      <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={onClose} />
    ));
    fireEvent.click(screen.getByTestId('paste-from-json-dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel button clicked', () => {
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockResolvedValue('') },
    });
    const onClose = vi.fn();
    render(() => (
      <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={onClose} />
    ));
    fireEvent.click(screen.getByTestId('paste-from-json-cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('clipboard pre-populate', () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: { readText: vi.fn().mockResolvedValue(SAMPLE_JSON) },
      });
    });

    it('pre-populates textarea from clipboard when open', async () => {
      render(() => (
        <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={vi.fn()} />
      ));
      await waitFor(() => {
        const ta = screen.getByTestId('paste-from-json-textarea') as HTMLTextAreaElement;
        expect(ta.value).toBe(SAMPLE_JSON);
      });
    });
  });

  describe('clipboard permission denied', () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: { readText: vi.fn().mockRejectedValue(new DOMException('NotAllowedError')) },
      });
    });

    it('shows clipboard error message when clipboard read fails', async () => {
      render(() => (
        <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={vi.fn()} />
      ));
      await waitFor(() => {
        expect(screen.getByTestId('paste-from-json-clipboard-error')).toBeTruthy();
      });
    });
  });

  describe('Import button', () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: { readText: vi.fn().mockResolvedValue('') },
      });
    });

    it('Import button is disabled when textarea is empty', () => {
      render(() => (
        <PasteFromJsonModal open={true} onImport={vi.fn()} onClose={vi.fn()} />
      ));
      const btn = screen.getByTestId('paste-from-json-import') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('calls onImport with textarea content when Import clicked', async () => {
      const onImport = vi.fn();
      render(() => (
        <PasteFromJsonModal open={true} onImport={onImport} onClose={vi.fn()} />
      ));
      const ta = screen.getByTestId('paste-from-json-textarea') as HTMLTextAreaElement;
      // Must set the DOM value before firing the input event so SolidJS onInput reads it.
      ta.value = SAMPLE_JSON;
      fireEvent.input(ta);
      // Wait for the signal to propagate, then click the import button.
      await waitFor(() => {
        const btn2 = screen.getByTestId('paste-from-json-import') as HTMLButtonElement;
        // Check the button is not disabled AND click it directly inside waitFor.
        expect(btn2.disabled).toBe(false);
        fireEvent.click(btn2);
        expect(onImport).toHaveBeenCalledWith(SAMPLE_JSON);
      });
    });
  });
});
