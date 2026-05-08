/**
 * SyncConflictDialog.test.tsx
 *
 * Tests for the SyncConflictDialog component (round 11 Q3d three-way conflict UI).
 */
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncConflictDialog } from '../SyncConflictDialog';
import type { SyncConflictPayload } from '../../app/bridge';
import { SceneDocument } from '../../core/scene/SceneDocument';
import type { AssetPath } from '../../utils/branded';

// ── SceneDocument fixtures ────────────────────────────────────────────────────

// Two real SceneDocuments that differ in env.rotation so the JSON diff
// produces both removed (-) and added (+) lines.
const localDoc = new SceneDocument();
localDoc.setEnv({ rotation: 0 });

const cloudDoc = new SceneDocument();
cloudDoc.setEnv({ rotation: 1 });

afterEach(cleanup);

const defaultConflict: SyncConflictPayload = {
  sceneId: 'scene-abc',
  scenePath: 'scenes/my-scene.erythos' as AssetPath,
  baseVersion: 3,
  currentVersion: 5,
  localBody: localDoc,
  cloudBody: cloudDoc,
};

const defaultProps = {
  conflict: defaultConflict,
  onKeepLocal: vi.fn(),
  onUseCloud: vi.fn(),
};

describe('SyncConflictDialog', () => {
  it('does not render when conflict=null', () => {
    render(() => <SyncConflictDialog conflict={null} onKeepLocal={vi.fn()} onUseCloud={vi.fn()} />);
    expect(screen.queryByTestId('sync-conflict-dialog')).toBeNull();
  });

  it('renders when conflict is provided', () => {
    render(() => <SyncConflictDialog {...defaultProps} />);
    expect(screen.getByTestId('sync-conflict-dialog')).toBeTruthy();
  });

  it('renders all three action buttons', () => {
    render(() => <SyncConflictDialog {...defaultProps} />);
    expect(screen.getByTestId('sync-conflict-keep-local')).toBeTruthy();
    expect(screen.getByTestId('sync-conflict-use-cloud')).toBeTruthy();
    expect(screen.getByTestId('sync-conflict-show-diff')).toBeTruthy();
  });

  it('shows cloud version number in message', () => {
    render(() => <SyncConflictDialog {...defaultProps} />);
    expect(screen.getByText(/v5/)).toBeTruthy();
  });

  it('shows backup path in message', () => {
    render(() => <SyncConflictDialog {...defaultProps} />);
    expect(screen.getByText(/\.bak\.v3/)).toBeTruthy();
  });

  describe('Keep local button', () => {
    it('calls onKeepLocal when clicked', () => {
      const onKeepLocal = vi.fn();
      render(() => <SyncConflictDialog {...defaultProps} onKeepLocal={onKeepLocal} />);
      fireEvent.click(screen.getByTestId('sync-conflict-keep-local'));
      expect(onKeepLocal).toHaveBeenCalledOnce();
    });
  });

  describe('Use cloud button', () => {
    it('calls onUseCloud when clicked', () => {
      const onUseCloud = vi.fn();
      render(() => <SyncConflictDialog {...defaultProps} onUseCloud={onUseCloud} />);
      fireEvent.click(screen.getByTestId('sync-conflict-use-cloud'));
      expect(onUseCloud).toHaveBeenCalledOnce();
    });
  });

  describe('Show diff button', () => {
    it('diff section is hidden by default', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      expect(screen.queryByTestId('sync-conflict-diff-section')).toBeNull();
    });

    it('clicking Show diff reveals the diff section', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      fireEvent.click(screen.getByTestId('sync-conflict-show-diff'));
      expect(screen.getByTestId('sync-conflict-diff-section')).toBeTruthy();
    });

    it('diff section contains + for cloud-only lines and - for local-only lines', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      fireEvent.click(screen.getByTestId('sync-conflict-show-diff'));
      const diffSection = screen.getByTestId('sync-conflict-diff-section');
      const text = diffSection.textContent ?? '';
      // Both docs differ in env.rotation (0 vs 1) — produces removed and added lines
      expect(text).toContain('- ');
      expect(text).toContain('+ ');
    });

    it('clicking Show diff again hides the diff section (toggle)', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      const btn = screen.getByTestId('sync-conflict-show-diff');
      fireEvent.click(btn);
      expect(screen.getByTestId('sync-conflict-diff-section')).toBeTruthy();
      fireEvent.click(btn);
      expect(screen.queryByTestId('sync-conflict-diff-section')).toBeNull();
    });

    it('button label changes to "Hide diff" when diff is expanded', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      const btn = screen.getByTestId('sync-conflict-show-diff');
      expect(btn.textContent).toBe('Show diff');
      fireEvent.click(btn);
      expect(btn.textContent).toBe('Hide diff');
    });
  });

  describe('Esc key', () => {
    it('pressing Escape collapses the diff when it is open', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      fireEvent.click(screen.getByTestId('sync-conflict-show-diff'));
      expect(screen.getByTestId('sync-conflict-diff-section')).toBeTruthy();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('sync-conflict-diff-section')).toBeNull();
    });

    it('pressing Escape when diff is closed does not dismiss the dialog', () => {
      render(() => <SyncConflictDialog {...defaultProps} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      // Dialog must still be present — conflict must be explicitly resolved
      expect(screen.getByTestId('sync-conflict-dialog')).toBeTruthy();
    });
  });
});
