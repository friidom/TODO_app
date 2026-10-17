import type { Transporter } from "nodemailer";

import { env } from "../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailDriver {
  send(message: MailMessage): Promise<void>;
}

// Prints the body, links included — this is what makes the auth mail flows
// testable with no SMTP. env.ts refuses to start with this in production.
const consoleDriver: MailDriver = {
  async send({ to, subject, text }) {
    console.log(`\n[mail:console] to: ${to}\n[mail:console] subject: ${subject}\n${text}\n`);
  },
};

let transport: Promise<Transporter> | undefined;

// One pooled transport for the process, not a fresh TLS handshake per message.
function smtpTransport(): Promise<Transporter> {
  transport ??= import("nodemailer").then(({ createTransport }) => {
    const port = env.SMTP_PORT ?? 587;

    return createTransport({
      host: env.SMTP_HOST,
      port,
      // 465 is TLS from the first byte; 587 must upgrade, and refuses to send in clear if it cannot.
      secure: port === 465,
      requireTLS: port !== 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      pool: true,
      maxConnections: 2,
      // A request that sends mail must not hang on a dead relay.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  return transport;
}

const smtpDriver: MailDriver = {
  async send({ to, subject, text, html }) {
    await (await smtpTransport()).sendMail({ from: env.MAIL_FROM, to, subject, text, html });
  },
};

export const mailer: MailDriver = env.MAIL_DRIVER === "smtp" ? smtpDriver : consoleDriver;

// For logs: the provider's code and the SMTP step, never the message, which can
// quote the recipient or the server's reply.
export function describeMailError(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown error";

  const { code, responseCode, command } = error as {
    code?: unknown;
    responseCode?: unknown;
    command?: unknown;
  };

  const parts = [code, responseCode, command].filter(
    (part) => typeof part === "string" || typeof part === "number",
  );

  return parts.length > 0 ? parts.join(" ") : "unknown error";
}
