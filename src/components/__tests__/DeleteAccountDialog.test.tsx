/**
 * DeleteAccountDialog.test.tsx
 *
 * Tests for the delete-account confirm gate (issue #941).
 *
 * Query strategy: semantic queries (getByRole / getByText / getByLabelText)
 * are preferred over data-testid so tests remain compatible with the
 * forthcoming #939 a11y changes (role="dialog" / role="alert").
 * data-testid is used only for the error paragraph, which has no ARIA role
 * until #939 lands (role="alert" is planned there).
 *
 * Note: The component currently wraps the input inside a <label> that
 * contains a child <span> for the username, which makes getByLabelText
 * unreliable (the accessible name includes the span text). getByRole('textbox')
 * is used instead and is stable.
 */

import { render, screen, fireEvent, cleanup, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteAccountDialog } from '../DeleteAccountDialog';
import type { User } from '../../core/auth/AuthClient';

afterEach(cleanup);

const FAKE_USER: User = {
  id: 'user-uuid-1',
  githubLogin: 'octocat',
  email: 'octocat@github.com',
  avatarUrl: 'https://avatars.githubusercontent.com/u/1',
  storageUsed: 0,
  isAdmin: false,
  scheduledDeleteAt: null,
};

function renderDialog(overrides: {
  open?: boolean;
  user?: User;
  onConfirm?: () => Promise<{ scheduledDeleteAt: string }>;
  onClose?: () => void;
} = {}) {
  const props = {
    open: true,
    user: FAKE_USER,
    onConfirm: vi.fn().mockResolvedValue({ scheduledDeleteAt: '2026-06-15T00:00:00.000Z' }),
    onClose: vi.fn(),
    ...overrides,
  };
  render(() => <DeleteAccountDialog {...props} />);
  return props;
}

// ─── Visibility ───────────────────────────────────────────────────────────────

describe('DeleteAccountDialog visibility', () => {
  it('does not render when open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Delete account')).toBeNull();
  });

  it('renders dialog title when open=true', () => {
    renderDialog({ open: true });
    // The h3 title contains "Delete account"; the confirm button now says "Schedule deletion".
    const heading = screen.getByRole('heading', { name: 'Delete account' });
    expect(heading).toBeTruthy();
  });
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('DeleteAccountDialog initial state', () => {
  it('Delete button is disabled when input is empty', () => {
    renderDialog();
    const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
    expect(deleteBtn).toBeDisabled();
  });

  it('Cancel button is enabled initially', () => {
    renderDialog();
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn).not.toBeDisabled();
  });

  it('shows the GitHub username in the confirmation prompt', () => {
    renderDialog();
    expect(screen.getByText('octocat')).toBeTruthy();
  });
});

// ─── Username confirmation guard ──────────────────────────────────────────────

describe('DeleteAccountDialog username guard', () => {
  it('Delete button stays disabled when wrong username is typed', () => {
    renderDialog();
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'wronguser' } });
    const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
    expect(deleteBtn).toBeDisabled();
  });

  it('Delete button stays disabled with partial username match', () => {
    renderDialog();
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octo' } });
    const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
    expect(deleteBtn).toBeDisabled();
  });

  it('Delete button becomes enabled when exact GitHub username is typed', () => {
    renderDialog();
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
    expect(deleteBtn).not.toBeDisabled();
  });

  it('Delete button reverts to disabled when username is cleared again', () => {
    renderDialog();
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    fireEvent.input(input, { target: { value: '' } });
    const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
    expect(deleteBtn).toBeDisabled();
  });
});

// ─── Successful deletion ──────────────────────────────────────────────────────

describe('DeleteAccountDialog successful deletion', () => {
  beforeEach(() => {
    // Prevent jsdom from throwing on navigation
    Object.defineProperty(window, 'location', {
      value: { href: '/' },
      writable: true,
      configurable: true,
    });
  });

  it('calls onConfirm when Delete button is clicked with correct username', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ scheduledDeleteAt: '2026-06-15T00:00:00.000Z' });
    renderDialog({ onConfirm });

    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    fireEvent.click(screen.getByRole('button', { name: /schedule deletion/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledOnce();
    });
  });

  it('redirects to / after successful delete (grace period begins)', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ scheduledDeleteAt: '2026-06-15T00:00:00.000Z' });
    renderDialog({ onConfirm });

    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    fireEvent.click(screen.getByRole('button', { name: /schedule deletion/i }));

    await waitFor(() => {
      expect(window.location.href).toBe('/');
    });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('DeleteAccountDialog error handling', () => {
  it('shows inline error when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Account deletion failed'));
    renderDialog({ onConfirm });

    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    fireEvent.click(screen.getByRole('button', { name: /schedule deletion/i }));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-error')).toBeTruthy();
      expect(screen.getByTestId('delete-account-error').textContent).toContain(
        'Account deletion failed',
      );
    });
  });

  it('re-enables Delete button after failed deletion (not stuck in pending)', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Server error'));
    renderDialog({ onConfirm });

    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    fireEvent.click(screen.getByRole('button', { name: /schedule deletion/i }));

    await waitFor(() => {
      // After error, button should be enabled again (deleting state reset)
      const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
      expect(deleteBtn).not.toBeDisabled();
    });
  });
});

// ─── Delete-while-pending guard ───────────────────────────────────────────────

describe('DeleteAccountDialog pending guard', () => {
  it('Delete button is disabled while deletion is in-flight', async () => {
    // Never resolves — keeps the component in "deleting" state
    const onConfirm = vi.fn().mockReturnValue(new Promise(() => { /* pending */ }));
    renderDialog({ onConfirm });

    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });

    const deleteBtn = screen.getByRole('button', { name: /schedule deletion/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      // Button text changes to "Deleting…" and becomes disabled
      expect(screen.getByRole('button', { name: /scheduling/i })).toBeDisabled();
    });
  });

  it('Cancel button is disabled while deletion is in-flight', async () => {
    const onConfirm = vi.fn().mockReturnValue(new Promise(() => { /* pending */ }));
    renderDialog({ onConfirm });

    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'octocat' } });
    fireEvent.click(screen.getByRole('button', { name: /schedule deletion/i }));

    await waitFor(() => {
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelBtn).toBeDisabled();
    });
  });
});

// ─── Close behaviour ──────────────────────────────────────────────────────────

describe('DeleteAccountDialog close behaviour', () => {
  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
