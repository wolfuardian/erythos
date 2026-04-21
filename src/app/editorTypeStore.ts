const TYPES = new Map<string, string>();
const listeners = new Set<() => void>();

export function getEditorType(panelId: string): string | undefined {
  return TYPES.get(panelId);
}

export function setEditorType(panelId: string, type: string): void {
  TYPES.set(panelId, type);
  listeners.forEach(fn => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hydrate(data: Record<string, string>): void {
  TYPES.clear();
  for (const [k, v] of Object.entries(data)) TYPES.set(k, v);
}

export function snapshot(): Record<string, string> {
  return Object.fromEntries(TYPES);
}

export function clear(): void {
  TYPES.clear();
}
