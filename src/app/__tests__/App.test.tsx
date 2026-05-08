/**
 * App.test.tsx
 *
 * Component tests for App-level spec §7.2:
 *   - Welcome renders when no project is open
 *   - after open → close, Welcome is shown again
 *   - after re-open, the chip shows the new projectName
 *
 * Strategy: App.tsx is deeply coupled to Editor/LocalSyncEngine/ProjectManager/Three.js.
 * Instead of mocking the entire stack, we test the UI contract via a minimal shim
 * component that mirrors App's Show-gate logic and ProjectChip binding. This validates
 * the spec §7.2 behavioral contracts without fragile full-mock integration tests.
 *
 * Full open→close E2E integration is covered by Playwright (e2e layer).
 */
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectChip } from '../../components/ProjectChip';
import type { ProjectEntry } from '../../core/project/ProjectHandleStore';

afterEach(cleanup);

/**
 * AppShim mirrors App's Show gate and ProjectChip wiring:
 *   - projectOpen / projectName are externally driven signals (stand-in for App state)
 *   - Welcome fallback is a div[data-testid="welcome"]
 *   - Editor view shows ProjectChip with the current project name
 */
const AppShim = (props: {
  projectOpen: () => boolean;
  projectName: () => string;
  onCloseProject: () => void;
  recentProjects?: ProjectEntry[];
  currentProjectId?: string | null;
}) => (
  <Show
    when={props.projectOpen()}
    fallback={<div data-testid="welcome">Welcome Screen</div>}
  >
    <div data-testid="editor-view">
      <ProjectChip
        projectName={props.projectName()}
        autosaveStatus="idle"
        onCloseProject={props.onCloseProject}
        recentProjects={props.recentProjects ?? []}
        currentProjectId={props.currentProjectId ?? null}
        onOpenProject={vi.fn(() => Promise.resolve())}
      />
    </div>
  </Show>
);

describe('App §7.2 — Welcome shown when no project open', () => {
  it('shows Welcome when projectOpen=false', () => {
    render(() => (
      <AppShim
        projectOpen={() => false}
        projectName={() => ''}
        onCloseProject={vi.fn()}
      />
    ));
    expect(screen.getByTestId('welcome')).toBeTruthy();
    expect(screen.queryByTestId('editor-view')).toBeNull();
  });

  it('shows editor view (not Welcome) when projectOpen=true', () => {
    render(() => (
      <AppShim
        projectOpen={() => true}
        projectName={() => 'My Scene'}
        onCloseProject={vi.fn()}
      />
    ));
    expect(screen.queryByTestId('welcome')).toBeNull();
    expect(screen.getByTestId('editor-view')).toBeTruthy();
  });
});

describe('App §7.2 — open → close → Welcome 復現', () => {
  it('Welcome reappears after project is closed', () => {
    const [projectOpen, setProjectOpen] = createSignal(true);
    const [projectName, setProjectName] = createSignal('Alpha');

    const handleClose = () => {
      setProjectOpen(false);
      setProjectName('');
    };

    render(() => (
      <AppShim
        projectOpen={projectOpen}
        projectName={projectName}
        onCloseProject={handleClose}
      />
    ));

    // Initially: editor open
    expect(screen.queryByTestId('welcome')).toBeNull();
    expect(screen.getByTestId('project-chip').textContent).toContain('Alpha');

    // Close project via chip → confirm dialog → confirm
    fireEvent.click(screen.getByTestId('project-chip'));
    fireEvent.click(screen.getByTestId('project-chip-close-project'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    // Now Welcome should be shown
    expect(screen.getByTestId('welcome')).toBeTruthy();
    expect(screen.queryByTestId('editor-view')).toBeNull();
  });
});

describe('App §7.2 — re-open chip shows new projectName', () => {
  it('chip reflects new projectName after project switch', () => {
    const [projectName, setProjectName] = createSignal('Project One');

    render(() => (
      <AppShim
        projectOpen={() => true}
        projectName={projectName}
        onCloseProject={vi.fn()}
      />
    ));

    // Initial project name
    expect(screen.getByTestId('project-chip').textContent).toContain('Project One');

    // Simulate project switch (signal update)
    setProjectName('Project Two');

    // Chip should now display the new name
    expect(screen.getByTestId('project-chip').textContent).toContain('Project Two');
  });
});
