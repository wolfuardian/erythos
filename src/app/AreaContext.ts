import { createContext, useContext } from 'solid-js';
import type { Area } from './types';

export const AreaContext = createContext<Area | undefined>(undefined);

export function useArea(): Area | undefined {
  return useContext(AreaContext);
}
