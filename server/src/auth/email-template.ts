/**
 * Magic link email template (F-5 C3, refs docs/magic-link-spec.md § Resend Integration).
 *
 * Returns { subject, html, text } for the Resend SDK.
 *
 * Design constraints:
 * - No logo / external image URLs (avoids broken images + deliverability penalty)
 * - Inline styles only (Outlook / Gmail strip <style> blocks)
 * - Single-column max 600px layout (mobile-first email safe zone)
 * - Solid background on CTA button (gradients break in Outlook)
 * - Both html + text fallback (deliverability: spam filters score text presence)
 */

export interface MagicLinkEmailOptions {
  link: string;
  validMinutes: number;
}

export interface MagicLinkEmailResult {
  subject: string;
  html: string;
  text: string;
}

export function magicLinkEmail({
  link,
  validMinutes,
}: MagicLinkEmailOptions): MagicLinkEmailResult {
  const subject = 'Your Erythos sign-in link';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;padding:40px 40px;box-shadow:0 1px 3px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.02em;">Sign in to Erythos</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:#52525b;">
                Click the button below to sign in. This link is valid for ${validMinutes} minutes.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <a href="${link}"
                 style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;letter-spacing:0.01em;">
                Sign in to Erythos
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:32px;">
              <p style="margin:0;font-size:14px;color:#71717a;">
                Or copy this link:<br />
                <code style="font-size:12px;color:#3f3f46;word-break:break-all;">${link}</code>
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e4e4e7;padding-top:24px;">
              <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
                If you didn't request this, please ignore this email — no account changes will be made.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Sign in to Erythos

Click the link below to sign in. This link is valid for ${validMinutes} minutes.

${link}

If you didn't request this, please ignore this email — no account changes will be made.`;

  return { subject, html, text };
}
