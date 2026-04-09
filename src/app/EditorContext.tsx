import { createContext, useContext, type ParentComponent } from 'solid-js';
import type { EditorBridge } from './bridge';

const Ctx = createContext<EditorBridge>();

export const EditorProvider: ParentComponent<{ bridge: EditorBridge }> = (props) => {
  return <Ctx.Provider value={props.bridge}>{props.children}</Ctx.Provider>;
};

export function useEditor(): EditorBridge {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditor() must be used inside <EditorProvider>');
  return ctx;
}
