type CoreAuthority = { fetch(request: Request): Promise<Response> };
type AuthorityEnv = {
  WORKFORCE_CORE?: CoreAuthority;
};

/**
 * Read-only Core Service Binding client. No admin Durable Object is exposed to
 * staging and no static identity map can authorize a request.
 * The Core endpoint must independently validate the Access JWT and persisted
 * identity before returning this narrow response.
 */
export async function resolvePersistedWorkforceActor(
  request: Request,
  env: AuthorityEnv
): Promise<{ actorId: string; tenantId: string; role: "owner" | "user"; enabledEmployees: string[] }> {
  if (!env.WORKFORCE_CORE) throw new Error("WORKFORCE_AUTHORITY_UNAVAILABLE");
  const jwt = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!jwt) throw new Error("WORKFORCE_ACCESS_JWT_REQUIRED");
  const response = await env.WORKFORCE_CORE.fetch(new Request(
    "https://workforce.core.internal/api/internal/workforce/resolve-actor",
    { method: "GET", headers: { "cf-access-jwt-assertion": jwt }, redirect: "manual" }
  ));
  if (!response.ok) throw new Error(
    response.status === 401 || response.status === 403
      ? "WORKFORCE_ACTOR_FORBIDDEN" : "WORKFORCE_AUTHORITY_UNAVAILABLE"
  );
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") throw new Error("WORKFORCE_AUTHORITY_INVALID");
  const result = body as Record<string, unknown>;
  if (result.ok !== true || typeof result.actorId !== "string" ||
      !result.actorId.trim() || typeof result.tenantId !== "string" ||
      !result.tenantId.trim() || (result.role !== "owner" && result.role !== "user") ||
      !Array.isArray(result.enabledEmployees) ||
      !result.enabledEmployees.every((employee: unknown) =>
        employee === "EMP-001" || employee === "EMP-002" || employee === "EMP-003"))
    throw new Error("WORKFORCE_AUTHORITY_INVALID");
  return { actorId: result.actorId, tenantId: result.tenantId, role: result.role, enabledEmployees: result.enabledEmployees as string[] };
}
