import { verifyWorkforceAccessJwt } from "./workforce-admin-access-jwt";
import { resolveVerifiedAccessAdminReadActor } from "./workforce-admin-access-principal";
import { projectAuthorizedWorkforceAdminRead } from "./workforce-admin-read-projection";
import type { WorkforceAdminMutationPlan } from "../core/workforce-admin-mutations";
import type { AdminReadActor } from "./workforce-admin-scoped-read";

interface AccessReadEnv {
  WORKFORCE_ACCESS_TEAM_DOMAIN?: string;
  WORKFORCE_ACCESS_AUDIENCE?: string;
  ACCESS_IDENTITY_MAP_JSON?: string;
  WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON?: string;
  WORKFORCE_PLATFORM_ADMIN_ACTOR_ID?: string;
  WORKFORCE_PLATFORM_ADMIN_TOKEN?: string;
}
type Jwks = { keys: Array<JsonWebKey & { kid?: string; kty?: string }> };
type Fetcher = typeof fetch;

const headers = { "cache-control": "no-store" };
const fail = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers });

function accessConfig(env: AccessReadEnv): {
  issuer: string;
  audience: string;
  jwksUrl: string;
} {
  const team = env.WORKFORCE_ACCESS_TEAM_DOMAIN?.trim().toLowerCase();
  const audience = env.WORKFORCE_ACCESS_AUDIENCE?.trim();
  if (!team || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !audience)
    throw new Error("WORKFORCE_ACCESS_CONFIG_INVALID");
  return {
    issuer: `https://${team}`,
    audience,
    jwksUrl: `https://${team}/cdn-cgi/access/certs`
  };
}

function parseServerIdentities(
  json?: string
): Array<{
  email: string;
  actorId: string;
  tenantId: string;
  role: "owner" | "user";
}> {
  const parsed: unknown = JSON.parse(json ?? "[]");
  if (!Array.isArray(parsed))
    throw new Error("WORKFORCE_ADMIN_IDENTITIES_INVALID");
  return parsed.map((row: unknown) => {
    if (!row || typeof row !== "object")
      throw new Error("WORKFORCE_ADMIN_IDENTITIES_INVALID");
    const item = row as Record<string, unknown>;
    if (
      typeof item.email !== "string" ||
      typeof item.actorId !== "string" ||
      typeof item.tenantId !== "string" ||
      (item.role !== "owner" && item.role !== "user")
    )
      throw new Error("WORKFORCE_ADMIN_IDENTITIES_INVALID");
    return {
      email: item.email,
      actorId: item.actorId,
      tenantId: item.tenantId,
      role: item.role
    };
  });
}

function configuredPlatformEmails(env: AccessReadEnv): string[] {
  const parsed: unknown = JSON.parse(
    env.WORKFORCE_PLATFORM_ADMIN_EMAILS_JSON ?? "[]"
  );
  if (
    !Array.isArray(parsed) ||
    !parsed.every((x) => typeof x === "string" && x.trim())
  )
    throw new Error("WORKFORCE_PLATFORM_ADMIN_CONFIG_INVALID");
  return parsed.map((email) => email.trim().toLowerCase());
}

export async function readWorkforceAdminAccessActor(
  request: Request,
  env: AccessReadEnv,
  fetcher: Fetcher = fetch,
  persistedIdentities?: WorkforceAdminMutationPlan["identities"]
): Promise<AdminReadActor> {
  const config = accessConfig(env);
  const jwt = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!jwt) throw new Error("WORKFORCE_ACCESS_JWT_REQUIRED");
  const response = await fetcher(config.jwksUrl, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
    headers: { accept: "application/json" }
  });
  if (!response.ok) throw new Error("WORKFORCE_ACCESS_JWKS_UNAVAILABLE");
  const jwks = (await response.json()) as Jwks;
  if (!jwks || !Array.isArray(jwks.keys) || jwks.keys.length > 50)
    throw new Error("WORKFORCE_ACCESS_JWKS_INVALID");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const principal = await verifyWorkforceAccessJwt({
    jwt,
    jwks,
    issuer: config.issuer,
    audience: config.audience,
    nowSeconds
  });
  const platformEmails = configuredPlatformEmails(env);
  if (platformEmails.filter((x) => x === principal.email).length > 1)
    throw new Error("WORKFORCE_PLATFORM_ADMIN_CONFIG_INVALID");
  if (platformEmails.includes(principal.email)) {
    const actorId = env.WORKFORCE_PLATFORM_ADMIN_ACTOR_ID?.trim();
    if (!actorId || !env.WORKFORCE_PLATFORM_ADMIN_TOKEN)
      throw new Error("WORKFORCE_PLATFORM_ADMIN_CONFIG_INVALID");
    return { actorId, tenantId: "platform", role: "platform_admin" };
  }
  return resolveVerifiedAccessAdminReadActor({
    principal,
    expectedIssuer: config.issuer,
    expectedAudience: config.audience,
    nowSeconds,
    identities: persistedIdentities ?? parseServerIdentities(env.ACCESS_IDENTITY_MAP_JSON)
  });
}

/** Read path only. Never forward an external request, including caller-supplied headers, to the Durable Object. */
export async function handleWorkforceAdminGet(
  request: Request,
  env: AccessReadEnv & {
    WORKFORCE_ADMIN_STATE?: {
      idFromName(name: string): unknown;
      get(id: unknown): {
        fetch(url: string, init?: RequestInit): Promise<Response>;
      };
    };
  },
  fetcher: Fetcher = fetch
): Promise<Response> {
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  if (!env.WORKFORCE_ADMIN_STATE)
    return fail(503, "WORKFORCE_ADMIN_STATE_BINDING_MISSING");
  // Fetch only through the server-side Durable Object binding; external headers
  // are never forwarded. No state is exposed before Access JWT verification.
  let state: WorkforceAdminMutationPlan;
  try {
    const stub = env.WORKFORCE_ADMIN_STATE.get(env.WORKFORCE_ADMIN_STATE.idFromName("global"));
    const response = await stub.fetch("https://workforce.admin/state", { method: "GET" });
    if (!response.ok) return fail(503, "WORKFORCE_ADMIN_STATE_UNAVAILABLE");
    const body = (await response.json()) as { ok?: unknown; state?: WorkforceAdminMutationPlan };
    if (body.ok !== true || !body.state || !Array.isArray(body.state.manifests) || !Array.isArray(body.state.identities))
      throw new Error("WORKFORCE_ADMIN_STATE_INVALID");
    state = body.state;
  } catch {
    return fail(503, "WORKFORCE_ADMIN_STATE_UNAVAILABLE");
  }
  let actor: AdminReadActor;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher, state.identities);
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (
      code === "WORKFORCE_ACCESS_JWT_REQUIRED" ||
      code === "WORKFORCE_ACCESS_JWT_SIGNATURE_INVALID" ||
      code.startsWith("WORKFORCE_ACCESS_JWT_") ||
      code.startsWith("WORKFORCE_ACCESS_PRINCIPAL_") ||
      code.startsWith("WORKFORCE_ACCESS_IDENTITY_")
    ) return fail(401, "WORKFORCE_ADMIN_AUTH_REQUIRED");
    if (code.endsWith("_CONFIG_INVALID") || code === "WORKFORCE_ACCESS_JWKS_UNAVAILABLE" || code === "WORKFORCE_ACCESS_JWKS_INVALID")
      return fail(503, "WORKFORCE_ADMIN_AUTH_UNAVAILABLE");
    console.warn("workforce_admin_read_denied", { phase: "access_identity", reason: code || "UNEXPECTED_ERROR" });
    return fail(403, "WORKFORCE_ADMIN_READ_FORBIDDEN");
  }
  try {
    const snapshot = projectAuthorizedWorkforceAdminRead(state, actor);
    return Response.json({ ok: true, authorization: { role: actor.role, scope: actor.tenantId }, snapshot }, { headers });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : "";
    if (code.startsWith("WORKFORCE_ADMIN_READ_")) {
      console.warn("workforce_admin_read_denied", { phase: "scope_projection", reason: code });
      return fail(403, "WORKFORCE_ADMIN_READ_FORBIDDEN");
    }
    return fail(503, "WORKFORCE_ADMIN_STATE_UNAVAILABLE");
  }
}
