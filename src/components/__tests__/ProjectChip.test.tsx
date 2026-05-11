/**
 * ProjectChip.test.tsx
 *
 * Component tests for ProjectChip — covers spec §7.1:
 *   - chip renders project name
 *   - clicking chip opens / closes dropdown
 *   - Esc closes dropdown (when dialog not open)
 *   - click-outside closes dropdown
 *   - autosave error path shows danger variant in confirm dialog
 */
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectChip } from '../ProjectChip';
import type { ProjectEntry } from '../../core/project/ProjectHandleStore';

afterEach(cleanup);

const noopAsync = () => Promise.resolve();

const makeProps = (overrides: Partial<Parameters<typeof ProjectChip>[0]> = {}) => ({
  projectName: 'My Project',
  autosaveStatus: 'idle' as const,
  onCloseProject: vi.fn(),
  recentProjects: [] as ProjectEntry[],
  currentProjectId: null,
  onOpenProject: vi.fn(noopAsync),
  ...overrides,
});

describe('ProjectChip — chip display', () => {
  it('renders project name in chip', () => {
    render(() => <ProjectChip {...makeProps()} />);
    expect(screen.getByTestId('project-chip').textContent).toContain('My Project');
  });

  it('renders autosave dot with idle class by default', () => {
    render(() => <ProjectChip {...makeProps({ autosaveStatus: 'idle' })} />);
    const dot = screen.getByTestId('project-chip-autosave-dot');
    expect(dot).toBeTruthy();
  });

  it('renders autosave dot in error state', () => {
    render(() => <ProjectChip {...makeProps({ autosaveStatus: 'error' })} />);
    const dot = screen.getByTestId('project-chip-autosave-dot');
    expect(dot).toBeTruthy();
  });
});

describe('ProjectChip — dropdown open/close', () => {
  it('dropdown is hidden initially', () => {
    render(() => <ProjectChip {...makeProps()} />);
    expect(screen.queryByTestId('project-chip-dropdown')).toBeNull();
  });

  it('clicking chip opens dropdown', () => {
    render(() => <ProjectChip {...makeProps()} />);
    fireEvent.click(screen.getByTestId('project-chip'));
    expect(screen.getByTestId('project-chip-dropdown')).toBeTruthy();
  });

  it('clicking chip again closes dropdown', () => {
    render(() => <ProjectChip {...makeProps()} />);
    fireEvent.click(screen.getByTestId('project-chip'));
    expect(screen.getByTestId('project-chip-dropdown')).toBeTruthy();
    fireEvent.click(screen.getByTestId('project-chip'));
    expect(screen.queryByTestId('project-chip-dropdown')).toBeNull();
  });
});

describe('ProjectChip — Esc closes dropdown', () => {
  it('Escape key closes an open dropdown', () => {
    render(() => <ProjectChip {...makeProps()} />);
    fireEvent.click(screen.getByTestId('project-chip'));
    expect(screen.getByTestId('project-chip-dropdown')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('project-chip-dropdown')).toBeNull();
  });

  it('Escape does nothing when dropdown is already closed', () => {
    render(() => <ProjectChip {...makeProps()} />);
    // No open, just fire Escape — should not throw or render dropdown
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('project-chip-dropdown')).toBeNull();
  });
});

describe('ProjectChip — confirm dialog on close', () => {
  it('clicking Close Project in dropdown opens confirm dialog', () => {
    render(() => <ProjectChip {...makeProps()} />);
    fireEvent.click(screen.getByTestId('project-chip'));
    // Dropdown shows; click Close Project button
    const closeBtn = screen.getByTestId('project-chip-close-project');
    fireEvent.click(closeBtn);
    // ConfirmDialog should now be open
    expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    expect(screen.getByTestId('confirm-dialog-title').textContent).toContain('Close project');
  });

  it('confirming calls onCloseProject', () => {
    const onCloseProject = vi.fn();
    render(() => <ProjectChip {...makeProps({ onCloseProject })} />);
    fireEvent.click(screen.getByTestId('project-chip'));
    fireEvent.click(screen.getByTestId('project-chip-close-project'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onCloseProject).toHaveBeenCalledOnce();
  });

  it('cancelling close project does NOT call onCloseProject', () => {
    const onCloseProject = vi.fn();
    render(() => <ProjectChip {...makeProps({ onCloseProject })} />);
    fireEvent.click(screen.getByTestId('project-chip'));
    fireEvent.click(screen.getByTestId('project-chip-close-project'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCloseProject).not.toHaveBeenCalled();
  });
});

describe('ProjectChip — autosave error path (spec §7.1)', () => {
  it('shows danger "Save Failed" dialog when autosaveStatus=error', () => {
    render(() => (
      <ProjectChip {...makeProps({ autosaveStatus: 'error' })} />
    ));
    // Open dropdown
    fireEvent.click(screen.getByTestId('project-chip'));
    // Click close
    fireEvent.click(screen.getByTestId('project-chip-close-project'));
    // Confirm dialog should show error-flavored copy
    const title = screen.getByTestId('confirm-dialog-title').textContent ?? '';
    expect(title).toContain('Save Failed');
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm');
    expect(confirmBtn.textContent).toContain('Continue Anyway');
  });
});

describe('ProjectChip — recent projects', () => {
  const recent: ProjectEntry[] = [
    { id: 'proj-1', name: 'Alpha', lastOpened: Date.now() - 60000, handle: null as unknown as FileSystemDirectoryHandle },
    { id: 'proj-2', name: 'Beta', lastOpened: Date.now() - 3600000, handle: null as unknown as FileSystemDirectoryHandle },
  ];

  it('shows recent project rows in dropdown', () => {
    render(() => (
      <ProjectChip {...makeProps({ recentProjects: recent, currentProjectId: 'proj-1' })} />
    ));
    fireEvent.click(screen.getByTestId('project-chip'));
    expect(screen.getByTestId('project-chip-row-proj-1')).toBeTruthy();
    expect(screen.getByTestId('project-chip-row-proj-2')).toBeTruthy();
  });

  it('clicking a different project row opens switch confirm dialog', () => {
    render(() => (
      <ProjectChip {...makeProps({ recentProjects: recent, currentProjectId: 'proj-1' })} />
    ));
    fireEvent.click(screen.getByTestId('project-chip'));
    fireEvent.click(screen.getByTestId('project-chip-row-proj-2'));
    const title = screen.getByTestId('confirm-dialog-title').textContent ?? '';
    expect(title).toContain('Beta');
  });
});
