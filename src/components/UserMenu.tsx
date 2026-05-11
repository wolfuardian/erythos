import { type Component, Show, createSignal, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { User } from '../core/auth/AuthClient';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import styles from './UserMenu.module.css';

export interface UserMenuProps {
  user: User;
  onSignOut: () => Promise<void>;
  onExportData: () => void;
  onDeleteAccount: () => Promise<void>;
}

export const UserMenu: Component<UserMenuProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [dropdownPos, setDropdownPos] = createSignal<{
    top?: number;
    right?: number;
    visibility: 'hidden' | 'visible';
  }>({ visibility: 'hidden' });
  const [signingOut, setSigningOut] = createSignal(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);

  let chipRef!: HTMLButtonElement;
  let dropdownRef!: HTMLDivElement;

  const calcPos = () => {
    const rect = chipRef.getBoundingClientRect();
    const MARGIN = 8;
    // Right-align dropdown to the chip's right edge
    const right = window.innerWidth - rect.right + MARGIN;
    const top = rect.bottom + 4;
    return { right, top, visibility: 'visible' as const };
  };

  const toggleOpen = () => {
    if (!open()) {
      // Render hidden first, measure, then show
      setDropdownPos({ visibility: 'hidden' });
      setOpen(true);
      requestAnimationFrame(() => {
        setDropdownPos(calcPos());
      });
    } else {
      setOpen(false);
    }
  };

  // Click-outside closes dropdown
  const onPointerDown = (e: PointerEvent) => {
    if (!open()) return;
    const target = e.target as Node;
    if (chipRef && chipRef.contains(target)) return;
    if (dropdownRef && dropdownRef.contains(target)) return;
    setOpen(false);
  };

  document.addEventListener('pointerdown', onPointerDown);
  onCleanup(() => document.removeEventListener('pointerdown', onPointerDown));

  // Escape closes dropdown (only when open)
  createEffect(() => {
    if (!open()) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await props.onSignOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  };

  const handleExportData = () => {
    props.onExportData();
    setOpen(false);
  };

  const handleOpenDeleteDialog = () => {
    setOpen(false);
    setDeleteDialogOpen(true);
  };

  const avatarInitial = () => props.user.githubLogin[0]?.toUpperCase() ?? '?';

  return (
    <>
      {/* Avatar chip trigger */}
      <button
        data-testid="toolbar-user-menu"
        ref={chipRef}
        type="button"
        class={styles.avatarChip}
        classList={{ [styles.avatarChipOpen]: open() }}
        onClick={toggleOpen}
        title={`Signed in as ${props.user.githubLogin}`}
      >
        <Show
          when={props.user.avatarUrl}
          fallback={
            <span class={styles.avatarInitial} aria-hidden="true">
              {avatarInitial()}
            </span>
          }
        >
          {(url) => (
            <img
              class={styles.avatarImg}
              src={url()}
              alt={props.user.githubLogin}
              width={24}
              height={24}
            />
          )}
        </Show>
        <span class={styles.avatarLogin}>{props.user.githubLogin}</span>
        <span class={styles.avatarCaret} aria-hidden="true">▾</span>
      </button>

      {/* Dropdown via Portal to escape toolbar overflow:hidden */}
      <Show when={open()}>
        <Portal mount={document.body}>
          <div
            data-testid="toolbar-user-menu-dropdown"
            ref={dropdownRef}
            class={styles.dropdown}
            // inline-allowed: computed offset from getBoundingClientRect + visibility toggle for measurement
            style={{
              top: dropdownPos().top !== undefined ? `${dropdownPos().top}px` : undefined,
              right: dropdownPos().right !== undefined ? `${dropdownPos().right}px` : undefined,
              visibility: dropdownPos().visibility,
            }}
          >
            {/* Header: login + email */}
            <div class={styles.dropdownHeader}>
              <div class={styles.dropdownLogin}>{props.user.githubLogin}</div>
              <div class={styles.dropdownEmail}>{props.user.email}</div>
            </div>

            {/* Export my data */}
            <button
              data-testid="toolbar-user-menu-export"
              type="button"
              class={styles.dropdownItem}
              onClick={handleExportData}
            >
              Export my data
            </button>

            {/* Delete account */}
            <button
              data-testid="toolbar-user-menu-delete"
              type="button"
              class={styles.dropdownItem}
              classList={{ [styles.dropdownItemDanger]: true }}
              onClick={handleOpenDeleteDialog}
            >
              Delete account
            </button>

            {/* Separator before Sign out */}
            <div class={styles.dropdownSeparator} />

            {/* Sign out */}
            <button
              data-testid="toolbar-user-menu-sign-out"
              type="button"
              class={styles.dropdownItem}
              classList={{ [styles.dropdownItemDanger]: true, [styles.dropdownItemDisabled]: signingOut() }}
              disabled={signingOut()}
              onClick={handleSignOut}
            >
              {signingOut() ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </Portal>
      </Show>

      <DeleteAccountDialog
        open={deleteDialogOpen()}
        user={props.user}
        onConfirm={props.onDeleteAccount}
        onClose={() => setDeleteDialogOpen(false)}
      />
    </>
  );
};
