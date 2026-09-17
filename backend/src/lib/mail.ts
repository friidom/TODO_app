import { env } from "../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailDriver {
  send(message: MailMessage): Promise<void>;
}

// Prints the body, reset link included — this is what makes the reset flow
// testable with no SMTP. env.ts refuses to start with this in production.
const consoleDriver: MailDriver = {
  async send({ to, subject, text }) {
    console.log(`\n[mail:console] to: ${to}\n[mail:console] subject: ${subject}\n${text}\n`);
  },
};

const smtpDriver: MailDriver = {
  async send({ to, subject, text }) {
    const { createTransport } = await import("nodemailer");

    const transport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });

    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
  },
};

export const mailer: MailDriver = env.MAIL_DRIVER === "smtp" ? smtpDriver : consoleDriver;
