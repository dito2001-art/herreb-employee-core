import { z } from "zod";
import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
const entrySchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  tenantId: z.string().min(1),
  kind: z.enum(["TASK", "MEETING", "EVENT"]),
  title: z.string().trim().min(1).max(500),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]),
  updatedAt: z.string(),
  version: z.number().int().positive()
});
const inputSchema = z
  .object({
    operation: z.enum(["get", "list", "save"]),
    id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,100}$/)
      .optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    expectedVersion: z.number().int().nonnegative().optional(),
    entry: entrySchema
      .omit({ tenantId: true, updatedAt: true, version: true })
      .strict()
      .optional()
  })
  .strict();
type Env = Parameters<typeof readWorkforceAdminAccessActor>[1] & {
  EMP002_OPERATIONS?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};
const fail = (status: number, error: string) =>
  Response.json(
    { ok: false, error },
    { status, headers: { "cache-control": "no-store" } }
  );
/** Browser access to native Workforce storage only. Never falls back to CRM/Google. */
export async function handleEMP002BrowserCalendar(
  request: Request,
  env: Env,
  fetcher?: typeof fetch
): Promise<Response> {
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (request.headers.has("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return fail(403, "CALENDAR_ORIGIN_REJECTED");
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return fail(415, "CALENDAR_JSON_REQUIRED");
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher);
  } catch {
    return fail(401, "CALENDAR_AUTH_REQUIRED");
  }
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(actor.tenantId) ||
    !["owner", "user"].includes(actor.role)
  )
    return fail(403, "CALENDAR_SCOPE_REJECTED");
  if (!env.EMP002_OPERATIONS) return fail(503, "NATIVE_CALENDAR_UNAVAILABLE");
  let input: z.infer<typeof inputSchema>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16384)
      return fail(413, "CALENDAR_TOO_LARGE");
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return fail(400, "CALENDAR_INVALID_INPUT");
  }
  if (
    input.operation === "save" &&
    (actor.role !== "owner" ||
      !input.entry ||
      input.expectedVersion === undefined)
  )
    return fail(403, "CALENDAR_WRITE_REJECTED");
  const stub = env.EMP002_OPERATIONS.get(
    env.EMP002_OPERATIONS.idFromName(`tenant:${actor.tenantId}`)
  );
  const call = (body: unknown) =>
    stub.fetch(
      new Request("https://emp002.operations/native-calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-herreb-internal-tenant-id": actor.tenantId
        },
        body: JSON.stringify(body)
      })
    );
  try {
    const operation = {
      ...input,
      ...(input.entry
        ? {
            entry: {
              ...input.entry,
              tenantId: actor.tenantId,
              updatedAt: new Date().toISOString()
            }
          }
        : {})
    };
    const response = await call(operation);
    if (!response.ok)
      return fail(
        response.status === 409 ? 409 : response.status === 400 ? 400 : 503,
        "NATIVE_CALENDAR_OPERATION_REJECTED"
      );
    const body = (await response.json()) as Record<string, unknown>;
    if (body.ok !== true) return fail(503, "NATIVE_CALENDAR_INVALID_RESPONSE");
    if (input.operation === "list") {
      const parsed = z.array(entrySchema).safeParse(body.entries);
      if (
        !parsed.success ||
        parsed.data.some((e) => e.tenantId !== actor.tenantId) ||
        new Set(parsed.data.map((e) => e.id)).size !== parsed.data.length
      )
        return fail(503, "CALENDAR_READ_SCOPE_REJECTED");
      return Response.json(
        {
          ok: true,
          tenantId: actor.tenantId,
          canWrite: actor.role === "owner",
          entries: parsed.data
        },
        { headers: { "cache-control": "no-store" } }
      );
    }
    if (input.operation === "get" && body.entry === null)
      return fail(404, "CALENDAR_NOT_FOUND");
    const parsed = entrySchema.safeParse(body.entry);
    const id = input.operation === "save" ? input.entry?.id : input.id;
    if (
      !parsed.success ||
      parsed.data.tenantId !== actor.tenantId ||
      parsed.data.id !== id
    )
      return fail(503, "CALENDAR_READ_SCOPE_REJECTED");
    if (input.operation === "save") {
      const get = await call({ operation: "get", id });
      if (!get.ok) return fail(503, "CALENDAR_READBACK_FAILED");
      const reread = (await get.json()) as Record<string, unknown>;
      const saved = entrySchema.safeParse(reread.entry);
      if (
        reread.ok !== true ||
        !saved.success ||
        JSON.stringify(saved.data) !== JSON.stringify(parsed.data) ||
        saved.data.version !== input.expectedVersion! + 1
      )
        return fail(503, "CALENDAR_READBACK_FAILED");
      for (const [key, value] of Object.entries(operation.entry!))
        if (saved.data[key as keyof typeof saved.data] !== value)
          return fail(503, "CALENDAR_READBACK_FAILED");
    }
    return Response.json(
      {
        ok: true,
        tenantId: actor.tenantId,
        entry: parsed.data,
        readBackConfirmed: input.operation === "save"
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return fail(503, "NATIVE_CALENDAR_UNAVAILABLE");
  }
}
