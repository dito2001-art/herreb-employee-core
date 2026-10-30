/** Internal request capabilities. The key is a dedicated, environment-local secret;
 * it is never installed by this candidate or exposed to the browser. */
export type BoundaryActor = {
  tenantId: string;
  actorId: string;
  role: "owner" | "user";
};
export type BoundaryKind = "calendar" | "marketing";
export type BoundaryEnv = {
  STAGING_DO_BOUNDARY_KEY?: string;
  EMP002_OPERATIONS?: DurableObjectNamespace;
  EMP003_CAMPAIGN_STATE?: DurableObjectNamespace;
};
// Hard bound per DO for the nonce prefix, not a time-based deletion promise.
// Never evict an unexpired nonce to admit another request.
export const MAX_BOUNDARY_NONCES = 1024;
const header = "x-workforce-do-capability";
const safe = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const hex = (v: ArrayBuffer) =>
  Array.from(new Uint8Array(v), (x) => x.toString(16).padStart(2, "0")).join(
    ""
  );
const encode = new TextEncoder();
const deny = () =>
  Response.json(
    { ok: false, error: "DO_BOUNDARY_DENIED" },
    { status: 403, headers: { "cache-control": "no-store" } }
  );
async function key(raw?: string) {
  if (!raw || encode.encode(raw).length < 32)
    throw Error("BOUNDARY_NOT_CONFIGURED");
  return crypto.subtle.importKey(
    "raw",
    encode.encode(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
async function digest(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete(header);
  // workerd adds transport framing when dispatching a body; bytes are bound below.
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      encode.encode(
        JSON.stringify([
          request.method,
          request.url,
          [...headers.entries()].sort(),
          await request.clone().text()
        ])
      )
    )
  );
}
function namespace(env: BoundaryEnv, kind: BoundaryKind) {
  return kind === "calendar"
    ? env.EMP002_OPERATIONS
    : env.EMP003_CAMPAIGN_STATE;
}
function name(kind: BoundaryKind, tenant: string) {
  return kind === "calendar" ? "tenant:" + tenant : tenant;
}
async function permitted(
  request: Request,
  actor: BoundaryActor,
  kind: BoundaryKind
) {
  const url = new URL(request.url),
    path = url.pathname;
  if (
    !safe(actor.tenantId) ||
    !actor.actorId ||
    !["owner", "user"].includes(actor.role)
  )
    return false;
  let body: Record<string, unknown> | undefined;
  if (request.method === "POST") {
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return false;
    const raw = await request.clone().text();
    if (encode.encode(raw).length > 65536) return false;
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    if (body.tenantId !== undefined && body.tenantId !== actor.tenantId)
      return false;
  }
  if (kind === "calendar") {
    if (path !== "/native-calendar" || request.method !== "POST" || url.search)
      return false;
    if (request.headers.get("x-herreb-internal-tenant-id") !== actor.tenantId)
      return false;
    if (
      !["get", "list", "save", "reminders", "availability"].includes(
        String(body?.operation)
      )
    )
      return false;
    if (body?.operation === "save" && actor.role !== "owner") return false;
    const entry = body?.entry as { tenantId?: unknown } | undefined;
    return !entry?.tenantId || entry.tenantId === actor.tenantId;
  }
  if (
    url.searchParams.getAll("tenantId").length !== 1 ||
    url.searchParams.get("tenantId") !== actor.tenantId
  )
    return false;
  const reads = [
    "/draft",
    "/drafts",
    "/operations",
    "/review",
    "/audit",
    "/copy-assets",
    "/copy-assets/content",
    "/copy-assets/context",
    "/copy-assets/status",
    "/copy-assets/approval",
    "/copy-assets/brand-brain"
  ];
  if (request.method === "GET") return reads.includes(path);
  if (
    request.method !== "POST" ||
    actor.role !== "owner" ||
    ![
      "/draft",
      "/transition",
      "/copy-assets/generate",
      "/copy-assets/edit",
      "/copy-assets/approve"
    ].includes(path)
  )
    return false;
  if (
    path.startsWith("/copy-assets/") &&
    request.headers.get("x-emp003-copy-actor") !== actor.actorId
  )
    return false;
  if (
    path === "/transition" &&
    (body?.actorId !== actor.actorId ||
      body?.actorRole !== "owner" ||
      !url.searchParams.has("expectedBlueprintRevision") ||
      !url.searchParams.has("expectedBlueprintHash"))
  )
    return false;
  return true;
}
/** Request-local fetch-only facade. Never spreads/proxies an RPC stub. */
export function scopeBoundaryNamespace(
  ns: DurableObjectNamespace,
  env: BoundaryEnv,
  actor: BoundaryActor,
  kind: BoundaryKind
) {
  const expected = ns.idFromName(name(kind, actor.tenantId));
  return {
    idFromName(requested: string) {
      if (requested !== name(kind, actor.tenantId))
        throw Error("BOUNDARY_SCOPE");
      return expected;
    },
    get(id: DurableObjectId) {
      if (id.toString() !== expected.toString()) throw Error("BOUNDARY_SCOPE");
      return {
        async fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request = new Request(input, init);
          if (
            request.headers.has(header) ||
            !(await permitted(request, actor, kind))
          )
            return deny();
          const payload = JSON.stringify({
            v: 1,
            kind,
            ...actor,
            expires: Date.now() + 30000,
            nonce: crypto.randomUUID(),
            requestHash: await digest(request)
          });
          const signature = hex(
            await crypto.subtle.sign(
              "HMAC",
              await key(env.STAGING_DO_BOUNDARY_KEY),
              encode.encode(payload)
            )
          );
          const headers = new Headers(request.headers);
          headers.set(header, JSON.stringify({ payload, signature }));
          return ns.get(expected).fetch(new Request(request, { headers }));
        }
      };
    }
  };
}
/** Authenticates exact request + object ID; atomically consumes each capability once.
 * Domain idempotency is separate: a retry receives a NEW capability for the SAME intent. */
export async function authorizeBoundary(
  request: Request,
  state: DurableObjectState,
  env: BoundaryEnv,
  kind: BoundaryKind
): Promise<boolean> {
  try {
    const raw = request.headers.get(header);
    if (!raw || raw.length > 4096) return false;
    const { payload, signature } = JSON.parse(raw);
    if (
      typeof payload !== "string" ||
      typeof signature !== "string" ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      return false;
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await key(env.STAGING_DO_BOUNDARY_KEY),
        Uint8Array.from(signature.match(/../g)!, (x) => parseInt(x, 16)),
        encode.encode(payload)
      ))
    )
      return false;
    const claim = JSON.parse(payload),
      now = Date.now();
    if (
      claim.v !== 1 ||
      claim.kind !== kind ||
      !Number.isSafeInteger(claim.expires) ||
      claim.expires <= now ||
      claim.expires > now + 30000 ||
      !/^[a-f0-9-]{36}$/.test(claim.nonce)
    )
      return false;
    const ns = namespace(env, kind);
    if (
      !ns ||
      !safe(claim.tenantId) ||
      ns.idFromName(name(kind, claim.tenantId)).toString() !==
        state.id.toString() ||
      claim.requestHash !== (await digest(request)) ||
      !(await permitted(request, claim, kind))
    )
      return false;
    const unexpired = () => claim.expires > Date.now();
    const admitted = await state.storage.transaction(async (txn) => {
      // Re-check after contention, not just before awaiting the transaction.
      if (!unexpired()) return false;
      const nonceKey = `i2:nonce:${claim.expires}:${claim.nonce}`;
      if (await txn.get(nonceKey)) return false;
      // Count and reclaim in the SAME transaction as admission. +1 detects a
      // legacy oversized prefix; drain it without ever admitting more records.
      const records = await txn.list({
        prefix: "i2:nonce:",
        limit: MAX_BOUNDARY_NONCES + 1
      });
      let retained = records.size;
      for (const [k] of records) {
        const expires = Number(k.split(":")[2]);
        if (Number.isSafeInteger(expires) && expires <= Date.now()) {
          await txn.delete(k);
          retained--;
        }
      }
      if (
        records.size > MAX_BOUNDARY_NONCES ||
        retained >= MAX_BOUNDARY_NONCES ||
        !unexpired()
      )
        return false;
      await txn.put(nonceKey, true);
      // An awaited write can cross the deadline too. Do not dispatch; removing
      // this expired marker is safe because an expired ticket cannot authorize.
      if (!unexpired()) {
        await txn.delete(nonceKey);
        return false;
      }
      return true;
    });
    // Also cover expiry while the transaction commit is awaited. The consumed
    // marker may remain, but no domain operation runs with this authorization.
    return admitted && unexpired();
  } catch {
    return false;
  }
}
export const boundaryDenied = deny;
