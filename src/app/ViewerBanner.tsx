/**
 * ViewerBanner.tsx
 *
 * Readonly viewer mode shell shown when URL is /scenes/{uuid} and the local
 * SyncEngine does not recognise this scene (guest / non-owner heuristic).
 *
 * Responsibilities (v0):
 *   - Display "Viewing <scene name> · [Edit]" banner
 *   - Edit button → SyncEngine.fork(sceneId) → navigate to /scenes/{newId}
 *   - Anonymous click on Edit → server 401 → prompt sign-in (spec § 294)
 *   - Viewport area is visually present but editing interactions are disabled
 *     via pointer-events CSS (no panel changes needed)
 */
import { type Component, createSignal, Show } from 'solid-js';
import { navigateToScene } from './router';
import type { SyncEngine, SceneId } from '../core/sync/SyncEngine';
import { AuthError } from '../core/auth/AuthClient';
import styles from './ViewerBanner.module.css';

interface ViewerBannerProps {
  sceneId: SceneId;
  sceneName: string;
  syncEngine: SyncEngine;
  onSignIn: () => void;
}

export const ViewerBanner: Component<ViewerBannerProps> = (props) => {
  const [forking, setForking] = createSignal(false);
  const [forkError, setForkError] = createSignal<string | null>(null);
  const [needsAuth, setNeedsAuth] = createSignal(false);

  const handleEdit = async () => {
    if (forking()) return;
    setForking(true);
    setForkError(null);
    setNeedsAuth(false);
    try {
      const result = await props.syncEngine.fork(props.sceneId);
      navigateToScene(result.id);
    } catch (err) {
      if (err instanceof AuthError) {
        setNeedsAuth(true);
      } else {
        setForkError(err instanceof Error ? err.message : 'Fork failed');
      }
      setForking(false);
    }
  };

  return (
    <div class={styles.banner}>
      <span class={styles.viewingLabel}>Viewing</span>
      <span class={styles.sceneNameEmphasis}>{props.sceneName}</span>
      <Show when={forkError()}>
        <span class={styles.sceneName} role="alert" aria-live="polite">&nbsp;— {forkError()}</span>
      </Show>
      <Show when={needsAuth()}>
        <span class={styles.sceneName} role="alert" aria-live="polite">&nbsp;— Sign in to fork to your account</span>
      </Show>
      <div class={styles.spacer} />
      <Show
        when={needsAuth()}
        fallback={
          <button
            class={styles.editButton}
            disabled={forking()}
            onClick={() => void handleEdit()}
          >
            <span aria-live="polite">{forking() ? 'Forking…' : 'Edit'}</span>
          </button>
        }
      >
        <button class={styles.editButton} onClick={props.onSignIn}>
          Sign in
        </button>
      </Show>
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
