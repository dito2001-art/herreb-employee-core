import { readWorkforceAdminAccessActor } from "./workforce-admin-access-read";
import type { ServiceFetcher } from "../adapters/sales-ops";

type Env = Parameters<typeof readWorkforceAdminAccessActor>[1] & {
  SALES_OPS?: ServiceFetcher;
  SALES_OPS_TOKEN?: string;
  SALES_OPS_TENANT_ID?: string;
};
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" }
  });
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Independent, read-only Sales Ops boundary. No client tenant or credential selectors. */
export async function handleEMP001BrowserSales(
  request: Request,
  env: Env,
  fetcher?: typeof fetch
): Promise<Response> {
  if (request.method !== "GET")
    return reply(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  let actor: Awaited<ReturnType<typeof readWorkforceAdminAccessActor>>;
  try {
    actor = await readWorkforceAdminAccessActor(request, env, fetcher);
  } catch {
    return reply(401, { ok: false, error: "SALES_AUTH_REQUIRED" });
  }
  if (!["owner", "user"].includes(actor.role))
    return reply(403, { ok: false, error: "SALES_SCOPE_REJECTED" });
  const url = new URL(request.url);
  if (
    [...url.searchParams.keys()].some((k) => k !== "orderId") ||
    url.searchParams.getAll("orderId").length > 1
  )
    return reply(400, { ok: false, error: "SALES_INVALID_SELECTOR" });
  const orderId = url.searchParams.get("orderId");
  if (orderId !== null && !/^[a-zA-Z0-9_-]{1,200}$/.test(orderId))
    return reply(400, { ok: false, error: "SALES_INVALID_ORDER_ID" });
  if (
    !env.SALES_OPS ||
    !env.SALES_OPS_TOKEN?.trim() ||
    !env.SALES_OPS_TENANT_ID?.trim()
  )
    return reply(503, { ok: false, error: "SALES_NOT_CONFIGURED" });
  if (env.SALES_OPS_TENANT_ID.trim() !== actor.tenantId)
    return reply(403, { ok: false, error: "SALES_TENANT_NOT_CONFIGURED" });
  try {
    const upstream = await env.SALES_OPS.fetch(
      new Request(
        "https://sales-ops.internal/api/v1/" +
          (orderId ? "orders/" + encodeURIComponent(orderId) : "products"),
        {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
          headers: {
            authorization: "Bearer " + env.SALES_OPS_TOKEN,
            "x-tenant-id": actor.tenantId
          }
        }
      )
    );
    if (upstream.status === 404 && orderId)
      return reply(404, { ok: false, error: "ORDER_NOT_FOUND" });
    if (!upstream.ok) throw new Error("UPSTREAM_FAILURE");
    const data: unknown = await upstream.json();
    if (!object(data) || data.ok !== true) throw new Error("INVALID_RESPONSE");
    if (orderId) {
      const order = data.order;
      if (
        !object(order) ||
        order.tenant_id !== actor.tenantId ||
        order.id !== orderId ||
        typeof order.status !== "string" ||
        !nonnegative(order.total_gs) ||
        typeof order.created_at !== "string" ||
        !Array.isArray(order.lines) ||
        order.lines.some(
          (line) =>
            !object(line) ||
            line.tenant_id !== actor.tenantId ||
            line.order_id !== orderId ||
            typeof line.sku !== "string" ||
            !nonnegative(line.qty) ||
            line.qty === 0 ||
            !nonnegative(line.unit_price_gs) ||
            !nonnegative(line.line_total_gs)
        )
      )
        throw new Error("SCOPE_MISMATCH");
      return reply(200, {
        ok: true,
        tenantId: actor.tenantId,
        order: {
          id: order.id,
          status: order.status,
          totalGs: order.total_gs,
          createdAt: order.created_at,
          lines: order.lines.map((line) => ({
            sku: line.sku,
            quantity: line.qty,
            unitPriceGs: line.unit_price_gs,
            totalGs: line.line_total_gs
          }))
        }
      });
    }
    if (
      data.tenant_id !== actor.tenantId ||
      !Array.isArray(data.products) ||
      data.products.some(
        (p) =>
          !object(p) ||
          p.tenant_id !== actor.tenantId ||
          typeof p.sku !== "string" ||
          typeof p.name !== "string" ||
          !nonnegative(p.price_gs) ||
          !nonnegative(p.stock_qty)
      )
    )
      throw new Error("SCOPE_MISMATCH");
    return reply(200, {
      ok: true,
      tenantId: actor.tenantId,
      products: data.products.map((p) => ({
        sku: p.sku,
        name: p.name,
        priceGs: p.price_gs,
        stock: p.stock_qty
      }))
    });
  } catch {
    return reply(502, { ok: false, error: "SALES_READBACK_UNAVAILABLE" });
  }
}
