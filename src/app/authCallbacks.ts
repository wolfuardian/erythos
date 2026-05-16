import { AuthClient } from '../core/auth/AuthClient';
import type { EditorBridgeDeps } from './bridge';

type AuthCallbacks = Pick<
  EditorBridgeDeps,
  | 'authSignOut'
  | 'authGetOAuthStartUrl'
  | 'authGetExportUrl'
  | 'authDeleteAccount'
  | 'authCancelDeleteAccount'
  | 'authRequestMagicLink'
>;

export function makeAuthCallbacks(authClient: AuthClient): AuthCallbacks {
  return {
    authSignOut: () => authClient.signOut(),
    authGetOAuthStartUrl: (provider) => authClient.getOAuthStartUrl(provider),
    authGetExportUrl: () => authClient.getExportUrl(),
    authDeleteAccount: () => authClient.deleteAccount(),
    authCancelDeleteAccount: () => authClient.cancelDeleteAccount(),
    authRequestMagicLink: (email) => authClient.requestMagicLink(email),
  };
}
