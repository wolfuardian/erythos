/**
 * Better Auth config skeleton (D1 placeholder).
 * GitHub OAuth provider will be wired in D3 once GITHUB_CLIENT_ID is set.
 */

export const authConfig = {
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      enabled: Boolean(process.env.GITHUB_CLIENT_ID),
    },
  },
  trustedOrigins: [] as string[],
  session: {
    secret: process.env.SESSION_SECRET ?? '',
  },
};
