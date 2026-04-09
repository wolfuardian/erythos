export interface Keybinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description?: string;
}

export class KeybindingManager {
  private bindings: Keybinding[] = [];
  private handler: ((e: KeyboardEvent) => void) | null = null;

  register(binding: Keybinding): void {
    this.bindings.push(binding);
  }

  registerMany(bindings: Keybinding[]): void {
    this.bindings.push(...bindings);
  }

  attach(target: EventTarget = window): void {
    this.detach();
    this.handler = (e: KeyboardEvent) => this.handleKeyDown(e);
    target.addEventListener('keydown', this.handler as EventListener);
  }

  detach(): void {
    if (this.handler) {
      window.removeEventListener('keydown', this.handler);
      this.handler = null;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Skip if user is typing in an input field
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    for (const b of this.bindings) {
      if (
        e.key.toLowerCase() === b.key.toLowerCase() &&
        !!e.ctrlKey === !!b.ctrl &&
        !!e.shiftKey === !!b.shift &&
        !!e.altKey === !!b.alt
      ) {
        e.preventDefault();
        b.action();
        return;
      }
    }
  }

  clear(): void {
    this.bindings.length = 0;
  }

  dispose(): void {
    this.detach();
    this.clear();
  }
}
