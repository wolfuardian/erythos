import { createContext, useContext } from 'solid-js';

export interface AreaContextValue {
  id: string;
  editorType: string;
  setEditorType: (nextId: string) => void;
}

export const AreaContext = createContext<AreaContextValue | undefined>(undefined);

export function useArea(): AreaContextValue | undefined {
  return useContext(AreaContext);
}
