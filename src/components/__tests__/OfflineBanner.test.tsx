/**
 * OfflineBanner.test.tsx
 *
 * Tests for the OfflineBanner component.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from '../OfflineBanner';

afterEach(cleanup);

describe('OfflineBanner', () => {
  it('renders with correct message text', () => {
    render(() => <OfflineBanner />);
    const msg = screen.getByTestId('offline-banner-message');
    expect(msg.textContent).toContain('Offline');
    expect(msg.textContent).toContain('reconnect to edit');
    expect(msg.textContent).toContain('read-only');
  });

  it('has data-testid="offline-banner" on root element', () => {
    render(() => <OfflineBanner />);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('has role="alert" and aria-live="assertive" for accessibility', () => {
    render(() => <OfflineBanner />);
    const banner = screen.getByTestId('offline-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('aria-live')).toBe('assertive');
  });

  it('does not render a dismiss button (not dismissible per spec)', () => {
    render(() => <OfflineBanner />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
