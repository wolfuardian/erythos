/**
 * ViewerBanner.tsx
 *
 * Readonly viewer mode shell shown when URL is /scenes/{uuid} and the local
 * SyncEngine does not recognise this scene (guest / non-owner heuristic).
 *
 * Responsibilities (v0):
 *   - Display "Viewing <scene name> · [Edit]" banner
 *   - Edit button → SyncEngine.fork(sceneId) → navigate to /scenes/{newId}
 *   - Viewport area is visually present but editing interactions are disabled
 *     via pointer-events CSS (no panel changes needed)
 */
import { type Component, createSignal, Show } from 'solid-js';
import { navigateToScene } from './router';
import type { SyncEngine, SceneId } from '../core/sync/SyncEngine';
import styles from './ViewerBanner.module.css';

interface ViewerBannerProps {
  sceneId: SceneId;
  sceneName: string;
  syncEngine: SyncEngine;
}

export const ViewerBanner: Component<ViewerBannerProps> = (props) => {
  const [forking, setForking] = createSignal(false);
  const [forkError, setForkError] = createSignal<string | null>(null);

  const handleEdit = async () => {
    if (forking()) return;
    setForking(true);
    setForkError(null);
    try {
      const result = await props.syncEngine.fork(props.sceneId);
      navigateToScene(result.id);
    } catch (err) {
      setForkError(err instanceof Error ? err.message : 'Fork failed');
      setForking(false);
    }
  };

  return (
    <div class={styles.banner}>
      <span class={styles.viewingLabel}>Viewing</span>
      <span class={styles.sceneNameEmphasis}>{props.sceneName}</span>
      <Show when={forkError()}>
        <span class={styles.sceneName}>&nbsp;— {forkError()}</span>
      </Show>
      <div class={styles.spacer} />
      <button
        class={styles.editButton}
        disabled={forking()}
        onClick={() => void handleEdit()}
      >
        {forking() ? 'Forking…' : 'Edit'}
      </button>
    </div>
  );
};

/** Full viewer shell: banner + readonly viewport placeholder */
export const ViewerShell: Component<ViewerBannerProps> = (props) => {
  return (
    <div class={styles.viewerRoot}>
      <ViewerBanner {...props} />
      <div class={styles.viewerContent}>
        {/* Readonly viewport — full 3D render without edit interactions */}
        <span>Loading scene…</span>
      </div>
    </div>
  );
};
