import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "@accordiq/core";

export interface PasswordResetMail {
  to: string;
  url: string;
}

export interface TransactionalMail {
  to: string;
  subject: string;
  text: string;
}

export type OutboundMail = {
  to: string;
  url?: string;
  subject?: string;
  text?: string;
};

export interface Mailer {
  sendPasswordReset: (mail: PasswordResetMail) => Promise<void>;
  sendTransactional: (mail: TransactionalMail) => Promise<{ id?: string } | void>;
}

export function createMemoryMailer(outbox: OutboundMail[] = []): Mailer & {
  outbox: OutboundMail[];
} {
  return {
    outbox,
    async sendPasswordReset(mail) {
      outbox.push(mail);
    },
    async sendTransactional(mail) {
      outbox.push(mail);
      return { id: `memory_${outbox.length}` };
    },
  };
}

export function createFailingMailer(
  failures = Number.POSITIVE_INFINITY,
): Mailer & { attempts: number } {
  const mailer = {
    attempts: 0,
    async sendPasswordReset() {
      mailer.attempts += 1;
      throw new Error("Failed to send email.");
    },
    async sendTransactional() {
      mailer.attempts += 1;
      if (mailer.attempts <= failures) {
        throw new Error("Failed to send email.");
      }
      return { id: "recovered" };
    },
  };
  return mailer;
}

function writeOutbox(outboxPath: string, payload: Record<string, string>) {
  mkdirSync(dirname(outboxPath), { recursive: true });
  appendFileSync(outboxPath, `${JSON.stringify({ at: new Date().toISOString(), ...payload })}\n`);
}

/**
 * Development mailer. Writes to a local outbox file so you can complete flows without SMTP.
 * Not allowed in production (rejected by loadConfig).
 */
export function createConsoleMailer(outboxPath: string): Mailer {
  return {
    async sendPasswordReset(mail) {
      writeOutbox(outboxPath, {
        to: mail.to,
        url: mail.url,
        subject: "Reset your AccordIQ password",
      });
      console.info(`Password reset queued for ${mail.to}. Open the outbox file to copy the link.`);
    },
    async sendTransactional(mail) {
      writeOutbox(outboxPath, { to: mail.to, subject: mail.subject, text: mail.text });
      console.info(`Notification email queued for ${mail.to}.`);
      return { id: `console_${Date.now()}` };
    },
  };
}

async function sendResend(input: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ id?: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to send email.");
  }
  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return { id: typeof body?.id === "string" ? body.id : undefined };
}

export function createMailer(config: AppConfig, options?: { outboxPath?: string }): Mailer {
  if (config.EMAIL_DRIVER === "resend") {
    const apiKey = config.RESEND_API_KEY;
    const from = config.EMAIL_FROM;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is required when EMAIL_DRIVER=resend");
    }
    return {
      async sendPasswordReset(mail) {
        await sendResend({
          apiKey,
          from,
          to: mail.to,
          subject: "Reset your AccordIQ password",
          text: `Reset your password using this link:\n${mail.url}\n\nIf you did not request this, you can ignore the email.`,
        });
      },
      async sendTransactional(mail) {
        return sendResend({ apiKey, from, to: mail.to, subject: mail.subject, text: mail.text });
      },
    };
  }
  return createConsoleMailer(options?.outboxPath ?? ".data/mail-outbox.jsonl");
}
