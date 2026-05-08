/**
 * router.test.ts
 *
 * Tests for src/app/router.ts:
 *  1. URL /scenes/{uuid} is parsed as { kind: 'scene', sceneId }
 *  2. URL / (and any non-scene path) is parsed as { kind: 'home' }
 *  3. navigateToScene(id) updates currentRoute signal with correct sceneId
 *  4. navigateHome() resets route to home
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { parsePath, navigate, navigateToScene, navigateHome, currentRoute } from '../router';

const ORIGINAL_PATHNAME = window.location.pathname;

afterEach(() => {
  // Restore original pathname after each test
  window.history.replaceState(null, '', ORIGINAL_PATHNAME);
  navigate(ORIGINAL_PATHNAME);
});

describe('router — parsePath()', () => {
  it('1. /scenes/{uuid} → { kind: "scene", sceneId }', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const route = parsePath(`/scenes/${uuid}`);
    expect(route.kind).toBe('scene');
    if (route.kind === 'scene') expect(route.sceneId).toBe(uuid);
  });

  it('1b. /scenes/{uuid-no-dashes} also matches', () => {
    const uuid = '550e8400e29b41d4a716446655440000';
    const route = parsePath(`/scenes/${uuid}`);
    expect(route.kind).toBe('scene');
    if (route.kind === 'scene') expect(route.sceneId).toBe(uuid);
  });

  it('2. / → { kind: "home" }', () => {
    expect(parsePath('/').kind).toBe('home');
  });

  it('2b. unknown path → { kind: "home" }', () => {
    expect(parsePath('/unknown').kind).toBe('home');
    expect(parsePath('/scenes/').kind).toBe('home');
    expect(parsePath('/scenes/short').kind).toBe('home');
  });
});

describe('router — navigation signals', () => {
  let disposeRoot: () => void;

  afterEach(() => {
    disposeRoot?.();
  });

  it('3. navigateToScene(id) updates currentRoute with correct sceneId', () => {
    const id = 'aaaabbbb-cccc-dddd-eeee-ffff00001234';
    createRoot((dispose) => {
      disposeRoot = dispose;
      navigateToScene(id);
      const r = currentRoute();
      expect(r.kind).toBe('scene');
      if (r.kind === 'scene') expect(r.sceneId).toBe(id);
    });
  });

  it('4. navigateHome() resets route to home', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    createRoot((dispose) => {
      disposeRoot = dispose;
      navigateToScene(id);
      expect(currentRoute().kind).toBe('scene');
      navigateHome();
      expect(currentRoute().kind).toBe('home');
    });
  });
});
