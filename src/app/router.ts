/**
 * router.ts
 *
 * Minimal history-mode router for /scenes/{uuid} URL scheme.
 *
 * Route shapes:
 *   { kind: 'home' }               — no sceneId, default editor
 *   { kind: 'scene', sceneId }     — /scenes/{uuid}
 */
import { createSignal, type Accessor } from 'solid-js';

export type Route =
  | { kind: 'home' }
  | { kind: 'scene'; sceneId: string };

/** Exported for unit-testing only. Parse a pathname into a Route. */
export function parsePath(path: string): Route {
  const m = /^\/scenes\/([0-9a-f-]{32,36})$/i.exec(path);
  if (m) return { kind: 'scene', sceneId: m[1] };
  return { kind: 'home' };
}

const [route, _setRoute] = createSignal<Route>(parsePath(window.location.pathname));

function applyRoute(newRoute: Route): void {
  _setRoute(() => newRoute);
}

// Listen to browser forward/back
window.addEventListener('popstate', () => {
  applyRoute(parsePath(window.location.pathname));
});

export const currentRoute: Accessor<Route> = route;

export function navigate(path: string): void {
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path);
  }
  applyRoute(parsePath(path));
}

export function navigateHome(): void {
  navigate('/');
}

export function navigateToScene(sceneId: string): void {
  navigate(`/scenes/${sceneId}`);
}
