import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, parseInput } from "@accordiq/core";
import { account, membership, organization, user, type Database } from "@accordiq/db";
import type { Auth } from "./create-auth";
import { hashPassword } from "./password";

export const registerAccountSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address."),
  password: z.string().min(10).max(200),
  organizationName: z.string().trim().min(2).max(80),
  /** Ignored. Sign-up always creates a new organization. */
  organizationId: z.unknown().optional(),
});

export function slugifyOrganizationName(name: string): string {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length > 0 ? base : "workspace";
}

async function uniqueSlug(db: Database, name: string): Promise<string> {
  const base = slugifyOrganizationName(name);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = attempt === 0 ? base : `${base.slice(0, 32)}-${randomBytes(3).toString("hex")}`;
    const existing = await db.query.organization.findFirst({ where: eq(organization.slug, slug) });
    if (!existing) return slug;
  }
  throw new AppError("CONFLICT", "Could not create that workspace.");
}

/**
 * Create a user, a new organization, and an ORGANIZATION_ADMIN membership, then sign them in.
 * Existing tenants cannot be joined from this path. Better Auth's public sign-up endpoint stays closed.
 */
export async function registerAccount(
  db: Database,
  auth: Auth,
  raw: unknown,
  origin: string,
): Promise<{ response: Response; organizationId: string; userId: string }> {
  const input = parseInput(registerAccountSchema, raw);
  const taken = await db.query.user.findFirst({ where: eq(user.email, input.email) });
  if (taken) {
    throw new AppError("CONFLICT", "An account with this email already exists. Sign in instead.");
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const slug = await uniqueSlug(db, input.organizationName);
  const passwordHash = await hashPassword(input.password);

  await db.insert(user).values({
    id: userId,
    name: input.name,
    email: input.email,
    emailVerified: true,
    platformRole: null,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: input.email,
    providerId: "credential",
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(organization).values({
    id: organizationId,
    name: input.organizationName,
    slug,
    timezone: "UTC",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(membership).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role: "ORGANIZATION_ADMIN",
    createdAt: now,
  });

  const response = await auth.api.signInEmail({
    body: { email: input.email, password: input.password },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  if (!response.ok) {
    throw new AppError(
      "INTERNAL",
      "Account was created but sign-in failed. Sign in from the login page.",
    );
  }
  return { response, organizationId, userId };
}
