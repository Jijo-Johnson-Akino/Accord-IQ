import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { AppConfig } from "@accordiq/core";
import type { Database } from "@accordiq/db";
import { account, session, user, verification } from "@accordiq/db";
import { defaultOrganizationId } from "./actor";
import type { Mailer } from "./mailer";
import { hashPassword, verifyPassword } from "./password";

export function createAuth(options: { db: Database; config: AppConfig; mailer: Mailer }) {
  const { db, config, mailer } = options;
  return betterAuth({
    appName: "AccordIQ",
    baseURL: config.APP_URL,
    basePath: "/api/auth",
    secret: config.AUTH_SECRET,
    trustedOrigins: [config.APP_URL],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 10,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
      sendResetPassword: async ({ user: target, url }) => {
        await mailer.sendPasswordReset({ to: target.email, url });
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        activeOrganizationId: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    user: {
      additionalFields: {
        platformRole: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    advanced: {
      useSecureCookies: config.NODE_ENV === "production",
      cookiePrefix: "accordiq",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.NODE_ENV === "production",
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (sessionRecord) => {
            const organizationId = await defaultOrganizationId(db, sessionRecord.userId);
            return { data: { ...sessionRecord, activeOrganizationId: organizationId } };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
