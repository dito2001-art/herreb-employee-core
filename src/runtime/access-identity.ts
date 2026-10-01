import type { RuntimeProvenance } from "./provenance";

export interface AccessIdentityBinding {
  email: string;
  tenantId: string;
  actorId: string;
  role: "owner" | "user";
}

export interface VerifiedAccessIdentity extends AccessIdentityBinding {
  email: string;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAccessIdentityBindings(raw: string | undefined): AccessIdentityBinding[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ACCESS_IDENTITY_MAP_INVALID_JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("ACCESS_IDENTITY_MAP_INVALID");

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`ACCESS_IDENTITY_MAP_INVALID_ENTRY:${index}`);
    const value = entry as Record<string, unknown>;
    const email = typeof value.email === "string" ? normalizeEmail(value.email) : "";
    const tenantId = typeof value.tenantId === "string" ? value.tenantId.trim() : "";
    const actorId = typeof value.actorId === "string" ? value.actorId.trim() : "";
    const role = value.role === "owner" || value.role === "user" ? value.role : undefined;
    if (!email || !tenantId || !actorId || !role) throw new Error(`ACCESS_IDENTITY_MAP_INVALID_ENTRY:${index}`);
    return { email, tenantId, actorId, role };
  });
}

export function resolveAccessIdentity(
  email: string,
  rawBindings: string | undefined
): VerifiedAccessIdentity | undefined {
  const normalized = normalizeEmail(email);
  const matches = parseAccessIdentityBindings(rawBindings).filter((entry) => entry.email === normalized);
  if (matches.length > 1) throw new Error("ACCESS_IDENTITY_MAP_DUPLICATE_EMAIL");
  const match = matches[0];
  return match ? { ...match, email: normalized } : undefined;
}

export function accessIdentityProvenance(identity: VerifiedAccessIdentity): RuntimeProvenance {
  return {
    assurance: identity.role === "owner" ? "OWNER_VERIFIED" : "SERVICE_VERIFIED",
    subjectId: identity.actorId,
    tenantId: identity.tenantId,
    source: "cloudflare-access-google"
  };
}

export async function accessAgentInstanceSuffix(identity: VerifiedAccessIdentity): Promise<string> {
  const material = new TextEncoder().encode(`${identity.tenantId}:${identity.email}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
