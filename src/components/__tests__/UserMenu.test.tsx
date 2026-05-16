/**
 * UserMenu.test.tsx — G2-3 (refs #1088)
 *
 * Tests focused on the audit log menu item visibility based on is_admin flag.
 * Other UserMenu interactions (sign-out, export, delete account) are exercised
 * via manual smoke testing; this file covers the new admin gate added in G2-3.
 *
 * Strategy: render UserMenu, open the dropdown via click, assert audit log
 * entry presence / absence depending on user.isAdmin.
 */

import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserMenu } from '../UserMenu';
import type { User } from '../../core/auth/AuthClient';

afterEach(cleanup);

const BASE_USER: User = {
  id: 'user-uuid-1',
  githubLogin: 'octocat',
  email: 'octocat@github.com',
  avatarUrl: null,
  storageUsed: 0,
  isAdmin: false,
};

const ADMIN_USER: User = {
  ...BASE_USER,
  isAdmin: true,
};

const defaultProps = {
  onSignOut: vi.fn().mockResolvedValue(undefined),
  onExportData: vi.fn(),
  onDeleteAccount: vi.fn().mockResolvedValue(undefined),
};

function renderMenu(user: User) {
  render(() => <UserMenu user={user} {...defaultProps} />);
  // Open the dropdown
  const chip = screen.getByTestId('toolbar-user-menu');
  fireEvent.click(chip);
}

describe('UserMenu — audit log entry visibility', () => {
  it('does NOT show audit log entry when is_admin = false', () => {
    renderMenu(BASE_USER);
    expect(screen.queryByTestId('toolbar-user-menu-admin-audit-log')).toBeNull();
  });

  it('shows audit log entry when is_admin = true', () => {
    renderMenu(ADMIN_USER);
    const link = screen.getByTestId('toolbar-user-menu-admin-audit-log');
    expect(link).toBeTruthy();
    expect(link.textContent).toBe('Audit log');
  });

  it('audit log entry is a link to /admin/audit-log', () => {
    renderMenu(ADMIN_USER);
    const link = screen.getByTestId('toolbar-user-menu-admin-audit-log') as HTMLAnchorElement;
    expect(link.href).toContain('/admin/audit-log');
  });
});
