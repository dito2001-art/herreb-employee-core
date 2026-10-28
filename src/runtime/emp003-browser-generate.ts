import { z } from "zod";
import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
import { MarketingCampaignBlueprintSchema } from "../core/marketing-campaign-blueprint";
import {
  generateEMP003Campaign,
  type EMP003GenerationEnv
} from "./emp003-generate-campaign";
type Env = Parameters<typeof readWorkforceAdminAccessActor>[1] &
  EMP003GenerationEnv;
const inputSchema = z
  .object({
    topic: z.string().trim().min(1).max(500),
    objective: z.string().trim().min(1).max(2000),
    sourceRefs: z
      .array(
        z
          .string()
          .url()
          .max(2048)
          .refine((value) => new URL(value).protocol === "https:")
      )
      .min(1)
      .max(5)
  })
  .strict();
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
/** Owner-only proposal generation. Does not persist, review, publish or impersonate M2M. */
export async function handleEMP003BrowserGenerate(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
  generate: typeof generateEMP003Campaign = generateEMP003Campaign
): Promise<Response> {
  if (request.method !== "POST")
    return reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (request.headers.has("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin)
  )
    return reply(403, { ok: false, error: "EMP003_ORIGIN_REJECTED" });
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return reply(415, { ok: false, error: "EMP003_JSON_REQUIRED" });
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher);
  } catch {
    return reply(401, { ok: false, error: "EMP003_ACCESS_REQUIRED" });
  }
  if (actor.role !== "owner" || !actor.tenantId)
    return reply(403, { ok: false, error: "EMP003_GENERATION_FORBIDDEN" });
  let input: z.infer<typeof inputSchema>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192)
      return reply(413, { ok: false, error: "EMP003_INPUT_TOO_LARGE" });
    input = inputSchema.parse(JSON.parse(raw));
  } catch {
    return reply(400, { ok: false, error: "EMP003_GENERATION_INPUT_INVALID" });
  }
  const correlationId = crypto.randomUUID();
  try {
    const response = await generate(env, actor.tenantId, {
      ...input,
      correlationId,
      saveDraft: false
    });
    if (!response.ok)
      return reply(503, { ok: false, error: "EMP003_GENERATION_UNAVAILABLE" });
    const data = (await response.json()) as Record<string, unknown>;
    const parsed = MarketingCampaignBlueprintSchema.safeParse(data.blueprint);
    if (
      data.ok !== true ||
      data.persisted === true ||
      data.publishExecuted !== false ||
      !parsed.success ||
      parsed.data.tenantId !== actor.tenantId ||
      parsed.data.correlationId !== correlationId ||
      parsed.data.status !== "DRAFT" ||
      parsed.data.publishApproved !== false
    )
      return reply(503, {
        ok: false,
        error: "EMP003_GENERATED_SCOPE_REJECTED"
      });
    console.log(
      JSON.stringify({
        event: "EMP003_BROWSER_PROPOSAL_GENERATED",
        tenantId: actor.tenantId,
        actorId: actor.actorId,
        correlationId,
        persisted: false,
        publishExecuted: false
      })
    );
    return reply(200, {
      ok: true,
      tenantId: actor.tenantId,
      blueprint: parsed.data,
      persisted: false,
      publishExecuted: false
    });
  } catch {
    return reply(503, { ok: false, error: "EMP003_GENERATION_UNAVAILABLE" });
  }
}
