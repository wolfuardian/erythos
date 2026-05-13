/**
 * router.ts
 *
 * Minimal history-mode router for /scenes/{uuid} URL scheme.
 *
 * Route shapes:
 *   { kind: 'home' }                              — no sceneId, default editor
 *   { kind: 'scene', sceneId }                    — /scenes/{uuid}
 *   { kind: 'scene', sceneId, shareToken }        — /scenes/{uuid}?share_token=<token>
 */
import { createSignal, type Accessor } from 'solid-js';

export type Route =
  | { kind: 'home' }
  | { kind: 'scene'; sceneId: string; shareToken?: string };

/** Exported for unit-testing only. Parse a pathname + search into a Route. */
export function parsePath(path: string, search = ''): Route {
  const m = /^\/scenes\/([0-9a-f-]{32,36})$/i.exec(path);
  if (m) {
    const params = new URLSearchParams(search);
    const shareToken = params.get('share_token') ?? undefined;
    return { kind: 'scene', sceneId: m[1], shareToken };
  }
  return { kind: 'home' };
}

const [route, _setRoute] = createSignal<Route>(parsePath(window.location.pathname, window.location.search));

function applyRoute(newRoute: Route): void {
  _setRoute(() => newRoute);
}

// Listen to browser forward/back
window.addEventListener('popstate', () => {
  applyRoute(parsePath(window.location.pathname, window.location.search));
});

export const currentRoute: Accessor<Route> = route;

export function navigate(path: string): void {
  const url = new URL(path, window.location.href);
  if (window.location.pathname + window.location.search !== url.pathname + url.search) {
    window.history.pushState(null, '', path);
  }
  applyRoute(parsePath(url.pathname, url.search));
}

export function navigateHome(): void {
  navigate('/');
}

export function navigateToScene(sceneId: string): void {
  navigate(`/scenes/${sceneId}`);
}
