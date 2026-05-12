/**
 * SyncErrorBanner.test.tsx
 *
 * Tests for the SyncErrorBanner component.
 */
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncErrorBanner, SyncErrorOverlay } from '../SyncErrorBanner';
import type { SyncErrorPayload } from '../../app/bridge';

afterEach(cleanup);

describe('SyncErrorBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders banner with correct message for payload-too-large', () => {
    const payload: SyncErrorPayload = { kind: 'payload-too-large', message: 'Scene exceeds size limit' };
    render(() => <SyncErrorBanner error={payload} onDismiss={vi.fn()} />);

    expect(screen.getByTestId('sync-error-banner')).toBeTruthy();
    const msg = screen.getByTestId('sync-error-banner-message');
    expect(msg.textContent).toContain('exceeds size limit');
  });

  it('renders banner with correct message for sync-failed-local-saved', () => {
    const payload: SyncErrorPayload = { kind: 'sync-failed-local-saved', message: 'Sync failed, local is saved' };
    render(() => <SyncErrorBanner error={payload} onDismiss={vi.fn()} />);

    const msg = screen.getByTestId('sync-error-banner-message');
    expect(msg.textContent).toContain('local is saved');
  });

  it('renders banner with correct message for network-offline', () => {
    const payload: SyncErrorPayload = { kind: 'network-offline', message: 'Sync failed (offline), local is saved' };
    render(() => <SyncErrorBanner error={payload} onDismiss={vi.fn()} />);

    const msg = screen.getByTestId('sync-error-banner-message');
    expect(msg.textContent).toContain('offline');
  });

  it('renders banner with correct message for client-bug', () => {
    const payload: SyncErrorPayload = { kind: 'client-bug', message: 'Sync error (internal)' };
    render(() => <SyncErrorBanner error={payload} onDismiss={vi.fn()} />);

    const msg = screen.getByTestId('sync-error-banner-message');
    expect(msg.textContent).toContain('internal');
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const payload: SyncErrorPayload = { kind: 'payload-too-large', message: 'Too large' };
    render(() => <SyncErrorBanner error={payload} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after 10 seconds for payload-too-large', () => {
    const onDismiss = vi.fn();
    const payload: SyncErrorPayload = { kind: 'payload-too-large', message: 'Too large' };
    render(() => <SyncErrorBanner error={payload} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after 8 seconds for client-bug', () => {
    const onDismiss = vi.fn();
    const payload: SyncErrorPayload = { kind: 'client-bug', message: 'Bug' };
    render(() => <SyncErrorBanner error={payload} onDismiss={onDismiss} />);

    vi.advanceTimersByTime(7_999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has role=alert and aria-live=assertive', () => {
    const payload: SyncErrorPayload = { kind: 'sync-failed-local-saved', message: 'Sync failed' };
    render(() => <SyncErrorBanner error={payload} onDismiss={vi.fn()} />);

    const banner = screen.getByTestId('sync-error-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
  });
});

describe('SyncErrorOverlay', () => {
  it('does not render when error is null', () => {
    render(() => <SyncErrorOverlay error={null} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('sync-error-banner')).toBeNull();
  });

  it('renders banner when error is set', () => {
    const payload: SyncErrorPayload = { kind: 'network-offline', message: 'Offline' };
    render(() => <SyncErrorOverlay error={payload} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('sync-error-banner')).toBeTruthy();
  });
});
