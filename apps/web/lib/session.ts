import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@accordiq/core";
import { loadActor, publicActor, type Actor } from "@accordiq/auth";
import { getRuntime } from "./runtime";
import { safeNextPath } from "./safe-path";

export async function getSessionPayload() {
  const { auth } = await getRuntime();
  return auth.api.getSession({ headers: await headers() });
}

export async function getActor(): Promise<Actor | null> {
  const payload = await getSessionPayload();
  if (!payload) return null;
  const { db } = await getRuntime();
  return loadActor(db, payload);
}

export async function requireActor(nextPath = "/dashboard"): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/login?next=${encodeURIComponent(safeNextPath(nextPath))}`);
  }
  return actor;
}

export async function requireApiActor(): Promise<{
  actor: Actor;
  sessionId: string;
  access: Awaited<ReturnType<typeof getRuntime>>["access"];
  clm: Awaited<ReturnType<typeof getRuntime>>["clm"];
  config: Awaited<ReturnType<typeof getRuntime>>["config"];
}> {
  const runtime = await getRuntime();
  const payload = await runtime.auth.api.getSession({ headers: await headers() });
  if (!payload) {
    throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
  }
  const actor = await loadActor(runtime.db, payload);
  return {
    actor,
    sessionId: payload.session.id,
    access: runtime.access,
    clm: runtime.clm,
    config: runtime.config,
  };
}

export async function shellProps(actor: Actor) {
  const { access } = await getRuntime();
  const organizations = await access.listAccessibleOrganizations(actor);
  return {
    actor: publicActor(actor),
    organizations: organizations.map((org) => ({ id: org.id, name: org.name })),
  };
}
