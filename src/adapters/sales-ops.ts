import type {
  CapabilityAdapter,
  CapabilityRequest,
  CapabilityResult
} from "../core";

export interface ServiceFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface SalesOpsAdapterOptions {
  service: ServiceFetcher;
  token: string;
  baseUrl?: string;
}

type SalesOpsInput =
  | { customerId?: string; need?: string }
  | {
      customerId: string;
      lines: Array<{ offeringId: string; quantity: number }>;
    }
  | { quoteId: string }
  | { transactionId: string };

function mapProductToOffering(
  product: Record<string, unknown>,
  tenantId: string
) {
  return {
    id: String(product.productId ?? product.id ?? product.sku ?? ""),
    tenantId,
    type: "PHYSICAL_PRODUCT" as const,
    name: String(product.name ?? ""),
    active: product.active !== false,
    description:
      typeof product.description === "string" ? product.description : undefined,
    currency:
      typeof product.currency === "string" ? product.currency : undefined,
    price: typeof product.price === "number" ? product.price : undefined,
    metadata: {
      legacySku: product.sku,
      stock: product.stock,
      imageUrl: product.imageUrl,
      source: "sales-ops-v1"
    }
  };
}

export function createSalesOpsAdapter(
  options: SalesOpsAdapterOptions
): CapabilityAdapter<SalesOpsInput, unknown> {
  const baseUrl = options.baseUrl ?? "https://sales-ops.internal";

  async function request(
    req: CapabilityRequest<SalesOpsInput>,
    path: string,
    init: RequestInit = {}
  ): Promise<CapabilityResult> {
    const response = await options.service.fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${options.token}`,
        "X-Tenant-ID": req.context.tenantId,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }

    if (!response.ok || (body as { ok?: boolean } | null)?.ok === false) {
      return {
        ok: false,
        error: {
          code: "SALES_OPS_UPSTREAM_ERROR",
          message: `Sales Ops returned ${response.status}`,
          retryable: response.status >= 500
        },
        evidence: { upstreamStatus: response.status }
      };
    }

    return {
      ok: true,
      output: body,
      evidence: { upstreamStatus: response.status, source: "sales-ops-v1" }
    };
  }

  return {
    id: "emp001-sales-ops-v1",
    employees: ["EMP-001"],
    capabilities: [
      "offering.read",
      "offering.recommend",
      "quote.create",
      "sale.progress"
    ],
    async execute(req) {
      const input = req.input as Record<string, unknown>;

      switch (req.capabilityId) {
        case "offering.read": {
          const result = await request(req, "/api/v1/products", {
            method: "GET"
          });
          if (!result.ok) return result;
          const payload = result.output as Record<string, unknown>;
          const products = Array.isArray(payload?.products)
            ? (payload.products as Record<string, unknown>[])
            : Array.isArray(payload?.data)
              ? (payload.data as Record<string, unknown>[])
              : [];
          return {
            ...result,
            output: {
              offerings: products.map((product) =>
                mapProductToOffering(product, req.context.tenantId)
              ),
              legacy: payload
            }
          };
        }
        case "offering.recommend":
          return request(req, "/api/v1/recommendations", {
            method: "POST",
            body: JSON.stringify({
              customer_id: input.customerId,
              need: input.need
            })
          });
        case "quote.create":
          return request(req, "/api/v1/quotes", {
            method: "POST",
            body: JSON.stringify({
              customer_id: input.customerId,
              lines: Array.isArray(input.lines)
                ? (input.lines as Array<Record<string, unknown>>).map(
                    (line) => ({
                      sku: line.offeringId,
                      qty: line.quantity
                    })
                  )
                : []
            })
          });
        case "sale.progress":
          if (typeof input.quoteId === "string") {
            return request(req, "/api/v1/orders", {
              method: "POST",
              body: JSON.stringify({ quote_id: input.quoteId })
            });
          }
          if (typeof input.transactionId === "string") {
            return request(
              req,
              `/api/v1/orders/${encodeURIComponent(input.transactionId)}`,
              { method: "GET" }
            );
          }
          return {
            ok: false,
            error: {
              code: "INVALID_SALE_PROGRESS_INPUT",
              message: "quoteId or transactionId is required"
            }
          };
        default:
          return {
            ok: false,
            error: { code: "UNSUPPORTED_CAPABILITY", message: req.capabilityId }
          };
      }
    }
  };
}
