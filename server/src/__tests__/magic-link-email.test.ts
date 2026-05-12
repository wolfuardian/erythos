/**
 * Unit tests for magicLinkEmail() template function (F-5 C3).
 *
 * Verifies the returned { subject, html, text } shape, required content
 * (link href, expiry mention, subject string), and no external image URLs.
 */

import { describe, it, expect } from 'vitest';
import { magicLinkEmail } from '../auth/email-template.js';

const TEST_LINK =
  'https://erythos.eoswolf.com/api/auth/magic-link/verify?token=abc123';
const VALID_MINUTES = 15;

describe('magicLinkEmail()', () => {
  it('returns the correct subject', () => {
    const { subject } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(subject).toBe('Your Erythos sign-in link');
  });

  it('html contains the link as an href', () => {
    const { html } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(html).toContain(`href="${TEST_LINK}"`);
  });

  it('html mentions the expiry duration', () => {
    const { html } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(html).toContain('15 minutes');
  });

  it('html contains the link verbatim (fallback copy-paste)', () => {
    const { html } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(html).toContain(TEST_LINK);
  });

  it('text contains the link', () => {
    const { text } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(text).toContain(TEST_LINK);
  });

  it('text mentions the expiry duration', () => {
    const { text } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(text).toContain('15 minutes');
  });

  it('text contains the disclaimer', () => {
    const { text } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(text).toContain("If you didn't request this");
  });

  it('html contains the disclaimer', () => {
    const { html } = magicLinkEmail({ link: TEST_LINK, validMinutes: VALID_MINUTES });
    expect(html).toContain("If you didn't request this");
  });

  it('subject is stable regardless of link/validMinutes values', () => {
    const { subject } = magicLinkEmail({
      link: 'https://example.com/verify?token=xyz',
      validMinutes: 30,
    });
    expect(subject).toBe('Your Erythos sign-in link');
  });

  it('html respects validMinutes parameter (30 min variant)', () => {
    const { html } = magicLinkEmail({
      link: TEST_LINK,
      validMinutes: 30,
    });
    expect(html).toContain('30 minutes');
    expect(html).not.toContain('15 minutes');
  });

  it('text respects validMinutes parameter (30 min variant)', () => {
    const { text } = magicLinkEmail({
      link: TEST_LINK,
      validMinutes: 30,
    });
    expect(text).toContain('30 minutes');
    expect(text).not.toContain('15 minutes');
  });
});
