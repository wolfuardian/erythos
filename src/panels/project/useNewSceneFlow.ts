import { createSignal } from 'solid-js';
import type { Editor } from '../../core/Editor';
import type { EditorBridge } from '../../app/bridge';

export interface NewSceneFlowProps {
  editor: Editor;
  bridge: EditorBridge;
  setError: (title: string, message: string) => void;
}

export interface NewSceneFlow {
  /** Whether the prompt dialog should be visible. */
  show: () => boolean;
  /** Called when the user confirms the scene name. Closes dialog, creates scene. */
  onConfirm: (name: string) => void;
  /** Called when the user cancels. Closes dialog. */
  onCancel: () => void;
  /** Open the new-scene prompt dialog. */
  open: () => void;
}

export function useNewSceneFlow(props: NewSceneFlowProps): NewSceneFlow {
  const [show, setShow] = createSignal(false);

  const open = () => setShow(true);
  const onCancel = () => setShow(false);

  const onConfirm = (name: string) => {
    // Close dialog immediately — before the async work — so it doesn't appear stuck.
    setShow(false);
    void (async () => {
      try {
        const path = await props.bridge.createScene(name);
        props.bridge.setCurrentScenePath(path);
        await props.editor.loadScene({ version: 1, nodes: [] });
      } catch (e: any) {
        props.setError('Create Scene Failed', e.message || String(e));
      }
    })();
  };

  return { show, onConfirm, onCancel, open };
}
