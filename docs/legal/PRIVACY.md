# Erythos Privacy Policy

**Last updated: 2026-05-16**

This Privacy Policy describes how Erythos ("we", "us") collects, uses, and protects information when you use the Erythos 3D editor service hosted at `erythos.eoswolf.com`.

## 1. Information We Collect

### 1.1 Account information

When you sign in via GitHub OAuth, we receive and store:
- GitHub username (login)
- Public email address (if provided to GitHub)
- Avatar URL
- GitHub user ID

When you sign in via magic link, we store:
- Email address you supplied

### 1.2 Project / scene content

- Scene data (3D node tree, geometry references, materials) you create or upload
- File asset uploads (texture / model binaries) associated with your scenes
- Share tokens you generate

### 1.3 Operational data

- Server-side request logs (IP address, request path, response code, timestamp) — retained for ~7 days for debugging and abuse mitigation
- Audit log of security-relevant events (sign-in attempts, scene create / delete, share token issue / revoke, account deletion) — retained for 90 days
- Local browser data: `localStorage` entries used to remember UI preferences, anonymous-to-registered migration state, and project metadata. Cleared when you clear browser data.

### 1.4 What we do NOT collect

- Browser cookies for tracking or advertising (we use only session / auth cookies)
- Camera, microphone, geolocation, or any other browser permissions
- Third-party analytics scripts

## 2. How We Use Information

- To authenticate you and maintain your session
- To store and sync your projects across devices
- To serve content to recipients of share tokens you create
- To debug technical issues and respond to abuse reports
- To comply with legal obligations (e.g. lawful requests from authorities)

## 3. Sharing With Third Parties

We do not sell, rent, or share your personal information with third parties for marketing.

Limited disclosure may occur:
- To service infrastructure providers (hosting, database) that operate under contract solely on our behalf
- When required by law or to protect against fraud or abuse
- With your explicit consent (e.g. recipients of share tokens you create)

## 4. Data Retention

| Category | Retention |
|---|---|
| Account record (user row) | Until you request deletion |
| Scene content | Until you delete the scene or close your account |
| Audit log | 90 days |
| Server request logs | ~7 days |
| Share tokens | Until you revoke them or close your account |

When you delete your account, we permanently remove your account record, scenes, share tokens, and uploaded assets within 30 days. Audit log entries referring to you are anonymised but the security record itself is retained for the 90-day audit window.

## 5. Your Rights

You can at any time:
- **Export your data** — via *UserMenu → Export my data* (downloads JSON of account record + scene metadata)
- **Delete your account** — via *UserMenu → Delete account* (irreversible; cascades to scenes, share tokens, assets)
- **Sign out** — clears the session cookie on this device

For requests beyond these self-serve flows (data correction, audit log access, GDPR DSAR), contact us (see § 7).

## 6. Security

- All traffic is encrypted in transit (TLS 1.2+)
- Session cookies are `HttpOnly` + `SameSite=Lax` + `Secure`
- We follow defense-in-depth practices: Content Security Policy, Origin validation, body size limits
- We do not log secrets or passwords

We cannot guarantee absolute security; you remain responsible for keeping your account credentials and share tokens private.

## 7. Contact

Questions, deletion requests, or GDPR DSAR: **wolfuardian@gmail.com**

## 8. Changes To This Policy

Material changes will be announced via the Welcome screen and in the GitHub repository changelog. Continued use after the effective date constitutes acceptance.
