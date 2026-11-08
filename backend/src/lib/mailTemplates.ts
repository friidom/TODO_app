import type { MailMessage } from "./mail.js";

const BRAND = "Veylo";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

// Inline styles and a single table: mail clients ignore <style> blocks and most layout CSS.
function layout({
  heading,
  body,
  action,
  link,
  footnote,
}: {
  heading: string;
  body: string;
  action: string;
  link: string;
  footnote: string;
}): string {
  const href = escape(link);

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f3f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1b22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f8;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e6e4ee">
<tr><td style="padding:32px 32px 8px;font-size:15px;font-weight:700;color:#7c3aed;letter-spacing:.2px">${BRAND}</td></tr>
<tr><td style="padding:8px 32px 0;font-size:20px;font-weight:600;line-height:1.3">${escape(heading)}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.6;color:#4a4855">${escape(body)}</td></tr>
<tr><td style="padding:24px 32px"><a href="${href}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escape(action)}</a></td></tr>
<tr><td style="padding:0 32px;font-size:13px;line-height:1.6;color:#6b6878">Or paste this link into your browser:<br><a href="${href}" style="color:#7c3aed;word-break:break-all">${href}</a></td></tr>
<tr><td style="padding:24px 32px 32px;font-size:13px;line-height:1.6;color:#6b6878">${escape(footnote)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function verificationEmail(link: string, hours: number): Omit<MailMessage, "to"> {
  const footnote = `The link expires in ${hours} hours and works once. If you did not create a ${BRAND} account, you can ignore this message.`;

  return {
    subject: `Confirm your email for ${BRAND}`,
    text: `Welcome to ${BRAND}.\n\nConfirm your email address to finish creating your account:\n\n${link}\n\n${footnote}`,
    html: layout({
      heading: "Confirm your email address",
      body: `Welcome to ${BRAND}. Confirm this address to finish creating your account and sign in.`,
      action: "Confirm email",
      link,
      footnote,
    }),
  };
}

export function passwordResetEmail(link: string, minutes: number): Omit<MailMessage, "to"> {
  const footnote = `It expires in ${minutes} minutes and can be used once. If you did not ask for it, nothing has changed and you can ignore this message.`;

  return {
    subject: `Reset your ${BRAND} password`,
    text: `Open this link to choose a new password:\n\n${link}\n\n${footnote}`,
    html: layout({
      heading: "Reset your password",
      body: "Someone asked to reset the password for this account. Choose a new one with the button below.",
      action: "Choose a new password",
      link,
      footnote,
    }),
  };
}
