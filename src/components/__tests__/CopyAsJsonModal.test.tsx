/**
 * CopyAsJsonModal.test.tsx
 *
 * Tests for the Copy as JSON modal component.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyAsJsonModal } from '../CopyAsJsonModal';

afterEach(cleanup);

const SAMPLE_JSON = '{\n  "version": 2,\n  "nodes": []\n}';

describe('CopyAsJsonModal', () => {
  it('does not render when open=false', () => {
    render(() => (
      <CopyAsJsonModal open={false} json={SAMPLE_JSON} onClose={vi.fn()} />
    ));
    expect(screen.queryByTestId('copy-as-json-modal')).toBeNull();
  });

  it('renders JSON content when open=true', () => {
    render(() => (
      <CopyAsJsonModal open={true} json={SAMPLE_JSON} onClose={vi.fn()} />
    ));
    expect(screen.getByTestId('copy-as-json-modal')).toBeTruthy();
    expect(screen.getByTestId('copy-as-json-pre').textContent).toBe(SAMPLE_JSON);
  });

  it('calls onClose when Escape key pressed', () => {
    const onClose = vi.fn();
    render(() => (
      <CopyAsJsonModal open={true} json={SAMPLE_JSON} onClose={onClose} />
    ));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay (backdrop) clicked', () => {
    const onClose = vi.fn();
    render(() => (
      <CopyAsJsonModal open={true} json={SAMPLE_JSON} onClose={onClose} />
    ));
    fireEvent.click(screen.getByTestId('copy-as-json-modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose when dialog inner area clicked', () => {
    const onClose = vi.fn();
    render(() => (
      <CopyAsJsonModal open={true} json={SAMPLE_JSON} onClose={onClose} />
    ));
    fireEvent.click(screen.getByTestId('copy-as-json-dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe('copy button', () => {
    beforeEach(() => {
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });

    it('calls navigator.clipboard.writeText with the JSON on click', async () => {
      render(() => (
        <CopyAsJsonModal open={true} json={SAMPLE_JSON} onClose={vi.fn()} />
      ));
      fireEvent.click(screen.getByTestId('copy-as-json-copy'));
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(SAMPLE_JSON);
      });
    });

    it('shows Copied! feedback after successful copy', async () => {
      render(() => (
        <CopyAsJsonModal open={true} json={SAMPLE_JSON} onClose={vi.fn()} />
      ));
      const btn = screen.getByTestId('copy-as-json-copy');
      expect(btn.textContent).toBe('Copy to clipboard');
      fireEvent.click(btn);
      await waitFor(() => {
        expect(btn.textContent).toBe('Copied!');
      });
    });
  });
});
