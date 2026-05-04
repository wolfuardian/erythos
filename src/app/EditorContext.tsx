import { createContext, useContext, type ParentComponent } from 'solid-js';
import type { EditorBridge } from './bridge';
import type { EditorDef } from './types';

interface EditorContextValue {
  bridge: EditorBridge;
  editors: readonly EditorDef[];
}

const Ctx = createContext<EditorContextValue>();

export const EditorProvider: ParentComponent<{
  bridge: EditorBridge;
  editors: readonly EditorDef[];
}> = (props) => {
  return (
    <Ctx.Provider value={{ bridge: props.bridge, editors: props.editors }}>
      {props.children}
    </Ctx.Provider>
  );
};

export function useEditor(): EditorBridge {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditor() must be used inside <EditorProvider>');
  return ctx.bridge;
}

export function useEditorsRegistry(): readonly EditorDef[] {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEditorsRegistry() must be used inside <EditorProvider>');
  return ctx.editors;
}
