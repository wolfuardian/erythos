/**
 * SignInDialog.test.tsx
 *
 * Covers the F-5 D1 sign-in dialog:
 * - Modal visibility + structure (title, GitHub button, email input, submit)
 * - GitHub OAuth path → navigates to oauthStartUrl
 * - Magic-link path → calls onRequestMagicLink, transitions through
 *   sending → sent (Check your inbox)
 * - Validation: empty email blocks submit
 * - Error path: onRequestMagicLink throws → error message shown, state returns
 *   to idle
 * - Close paths: Cancel button, ESC key, backdrop click
 */

import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInDialog } from '../SignInDialog';

afterEach(cleanup);

function renderDialog(overrides: {
  open?: boolean;
  onOpenOAuth?: () => void;
  onRequestMagicLink?: (email: string) => Promise<void>;
  onClose?: () => void;
} = {}) {
  const props = {
    open: true,
    onOpenOAuth: vi.fn(),
    onRequestMagicLink: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(() => <SignInDialog {...props} />);
  return props;
}

// ─── Visibility ──────────────────────────────────────────────────────────────

describe('SignInDialog visibility', () => {
  it('does not render when open=false', () => {
    renderDialog({ open: false });
    expect(screen.queryByText('Sign in to Erythos')).toBeNull();
  });

  it('renders dialog title when open=true', () => {
    renderDialog({ open: true });
    expect(screen.getByText('Sign in to Erythos')).toBeInTheDocument();
  });

  it('renders both GitHub button and email input by default (idle state)', () => {
    renderDialog();
    expect(screen.getByTestId('sign-in-dialog-github')).toBeInTheDocument();
    expect(screen.getByTestId('sign-in-dialog-email-input')).toBeInTheDocument();
    expect(
      screen.getByTestId('sign-in-dialog-email-submit'),
    ).toBeInTheDocument();
  });
});

// ─── GitHub OAuth path ───────────────────────────────────────────────────────

describe('SignInDialog GitHub OAuth path', () => {
  it('calls onOpenOAuth callback on GitHub button click (no window.location coupling)', () => {
    const onOpenOAuth = vi.fn();
    renderDialog({ onOpenOAuth });
    fireEvent.click(screen.getByTestId('sign-in-dialog-github'));
    expect(onOpenOAuth).toHaveBeenCalledTimes(1);
  });
});

// ─── Magic-link happy path ───────────────────────────────────────────────────

describe('SignInDialog magic-link happy path', () => {
  it('submitting valid email calls onRequestMagicLink + transitions to sent state', async () => {
    const onRequestMagicLink = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onRequestMagicLink });

    const input = screen.getByTestId('sign-in-dialog-email-input');
    fireEvent.input(input, { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByTestId('sign-in-dialog-email-submit'));

    expect(onRequestMagicLink).toHaveBeenCalledWith('alice@example.com');

    await waitFor(() => {
      expect(screen.getByTestId('sign-in-dialog-sent')).toBeInTheDocument();
    });
    expect(screen.getByText(/Check your inbox/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId('sign-in-dialog-email-input'),
    ).not.toBeInTheDocument();
  });

  it('trims whitespace from email before submit', async () => {
    const onRequestMagicLink = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onRequestMagicLink });

    fireEvent.input(screen.getByTestId('sign-in-dialog-email-input'), {
      target: { value: '  bob@example.com  ' },
    });
    fireEvent.click(screen.getByTestId('sign-in-dialog-email-submit'));

    await waitFor(() => {
      expect(onRequestMagicLink).toHaveBeenCalledWith('bob@example.com');
    });
  });
});

// ─── Magic-link validation + error paths ─────────────────────────────────────

describe('SignInDialog validation + error paths', () => {
  it('submit button is disabled when email is empty', () => {
    renderDialog();
    const submit = screen.getByTestId(
      'sign-in-dialog-email-submit',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows error message when onRequestMagicLink rejects', async () => {
    const onRequestMagicLink = vi
      .fn()
      .mockRejectedValue(new Error('Too many requests'));
    renderDialog({ onRequestMagicLink });

    fireEvent.input(screen.getByTestId('sign-in-dialog-email-input'), {
      target: { value: 'flood@example.com' },
    });
    fireEvent.click(screen.getByTestId('sign-in-dialog-email-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('sign-in-dialog-error')).toHaveTextContent(
        /Too many requests/,
      );
    });
    // returns to idle — submit button re-enabled, input still visible
    expect(
      screen.getByTestId('sign-in-dialog-email-input'),
    ).toBeInTheDocument();
  });
});

// ─── Close paths ─────────────────────────────────────────────────────────────

describe('SignInDialog close paths', () => {
  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByTestId('sign-in-dialog-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when ESC is pressed', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    const overlay = screen.getByTestId('sign-in-dialog');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking dialog body does NOT close (only backdrop closes)', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByText('Sign in to Erythos'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('after success, Close button calls onClose', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.input(screen.getByTestId('sign-in-dialog-email-input'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.click(screen.getByTestId('sign-in-dialog-email-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('sign-in-dialog-close')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('sign-in-dialog-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
