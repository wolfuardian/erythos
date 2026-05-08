/**
 * ShareDialog.test.tsx
 *
 * Tests for the ShareDialog component (issue #867).
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShareDialog } from '../ShareDialog';

afterEach(cleanup);

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  sceneId: 'abc-123',
  visibility: 'private' as const,
  onVisibilityChange: vi.fn(),
};

describe('ShareDialog', () => {
  it('does not render when open=false', () => {
    render(() => <ShareDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId('share-dialog')).toBeNull();
  });

  it('renders when open=true', () => {
    render(() => <ShareDialog {...defaultProps} />);
    expect(screen.getByTestId('share-dialog')).toBeTruthy();
  });

  it('calls onClose when overlay (backdrop) clicked', () => {
    const onClose = vi.fn();
    render(() => <ShareDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('share-dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape key pressed', () => {
    const onClose = vi.fn();
    render(() => <ShareDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('private visibility', () => {
    it('Copy Link button is disabled when visibility=private', () => {
      render(() => <ShareDialog {...defaultProps} visibility="private" />);
      const btn = screen.getByRole('button', { name: /copy link/i });
      expect(btn).toBeDisabled();
    });

    it('shows "Make public to share" hint when visibility=private', () => {
      render(() => <ShareDialog {...defaultProps} visibility="private" />);
      expect(screen.getByText('Make public to share')).toBeTruthy();
    });
  });

  describe('public visibility', () => {
    it('Copy Link button is enabled when visibility=public', () => {
      render(() => <ShareDialog {...defaultProps} visibility="public" />);
      const btn = screen.getByRole('button', { name: /copy link/i });
      expect(btn).not.toBeDisabled();
    });

    it('shows the share URL when visibility=public', () => {
      render(() => <ShareDialog {...defaultProps} visibility="public" />);
      expect(screen.getByText(/\/scenes\/abc-123/)).toBeTruthy();
    });

    describe('clipboard', () => {
      beforeEach(() => {
        Object.assign(navigator, {
          clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
      });

      it('calls navigator.clipboard.writeText with the share URL on Copy click', async () => {
        render(() => <ShareDialog {...defaultProps} visibility="public" />);
        fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
        await waitFor(() => {
          expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining('/scenes/abc-123')
          );
        });
      });

      it('shows "Copied" feedback after successful copy', async () => {
        render(() => <ShareDialog {...defaultProps} visibility="public" />);
        const btn = screen.getByRole('button', { name: /copy link/i });
        expect(btn.textContent).toBe('Copy Link');
        fireEvent.click(btn);
        await waitFor(() => {
          expect(btn.textContent).toBe('Copied');
        });
      });
    });
  });

  describe('visibility toggle', () => {
    it('calls onVisibilityChange("public") when Public button clicked', () => {
      const onVisibilityChange = vi.fn();
      render(() => (
        <ShareDialog
          {...defaultProps}
          visibility="private"
          onVisibilityChange={onVisibilityChange}
        />
      ));
      fireEvent.click(screen.getByRole('button', { name: 'Public' }));
      expect(onVisibilityChange).toHaveBeenCalledWith('public');
    });

    it('calls onVisibilityChange("private") when Private button clicked', () => {
      const onVisibilityChange = vi.fn();
      render(() => (
        <ShareDialog
          {...defaultProps}
          visibility="public"
          onVisibilityChange={onVisibilityChange}
        />
      ));
      fireEvent.click(screen.getByRole('button', { name: 'Private' }));
      expect(onVisibilityChange).toHaveBeenCalledWith('private');
    });
  });
});
