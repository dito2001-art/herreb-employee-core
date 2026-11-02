import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { handleEMP001BrowserSales } from "./emp001-browser-sales";
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
async function fixture() {
  const pair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const claims =
    encode({ alg: "RS256", kid: "sales-key" }) +
    "." +
    encode({
      iss: "https://sales-test.cloudflareaccess.com",
      aud: "sales",
      email: "a@test.invalid",
      iat: now - 5,
      exp: now + 600
    });
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(claims)
  );
  const jwt = claims + "." + Buffer.from(signature).toString("base64url");
  const calls: Request[] = [];
  let response = {
    ok: true,
    tenant_id: "tenant-a",
    products: [
      {
        tenant_id: "tenant-a",
        sku: "sku1",
        name: "Producto",
        price_gs: 25000,
        stock_qty: 3,
        privateField: "not-for-browser"
      }
    ]
  };
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "sales-test.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "sales",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      {
        email: "a@test.invalid",
        actorId: "a",
        tenantId: "tenant-a",
        role: "user"
      }
    ]),
    SALES_OPS_TENANT_ID: "tenant-a",
    SALES_OPS_TOKEN: "server-only-token",
    SALES_OPS: {
      fetch: async (input: RequestInfo | URL) => {
        calls.push(new Request(input));
        return Response.json(response);
      }
    }
  };
  const fetcher = (async () =>
    Response.json({
      keys: [{ ...jwk, kid: "sales-key", alg: "RS256", use: "sig" }]
    })) as typeof fetch;
  const request = (query = "") =>
    new Request("https://portal.test/api/emp001/operations" + query, {
      headers: { "cf-access-jwt-assertion": jwt }
    });
  return {
    env,
    fetcher,
    request,
    calls,
    setResponse: (v: unknown) => {
      response = v as typeof response;
    }
  };
}
test("signed browser identity reads authoritative catalog using server scope and bounded projection", async () => {
  const f = await fixture();
  const r = await handleEMP001BrowserSales(f.request(), f.env, f.fetcher);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {
    ok: true,
    tenantId: "tenant-a",
    products: [{ sku: "sku1", name: "Producto", priceGs: 25000, stock: 3 }]
  });
  assert.equal(f.calls[0].method, "GET");
  assert.equal(
    f.calls[0].headers.get("authorization"),
    "Bearer server-only-token"
  );
  assert.equal(f.calls[0].headers.get("x-tenant-id"), "tenant-a");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});
test("tenant selectors, duplicate IDs, traversal and write methods never reach authority", async () => {
  const f = await fixture();
  for (const q of [
    "?tenantId=tenant-b",
    "?orderId=1&orderId=2",
    "?orderId=../secret",
    "?orderId="
  ])
    assert.equal(
      (await handleEMP001BrowserSales(f.request(q), f.env, f.fetcher)).status,
      400
    );
  assert.equal(
    (
      await handleEMP001BrowserSales(
        new Request(f.request().url, { method: "POST" }),
        f.env,
        f.fetcher
      )
    ).status,
    405
  );
  assert.equal(f.calls.length, 0);
});
test("missing authentication or isolated binding fails closed", async () => {
  const f = await fixture();
  assert.equal(
    (
      await handleEMP001BrowserSales(
        new Request(f.request().url),
        f.env,
        f.fetcher
      )
    ).status,
    401
  );
  assert.equal(
    (
      await handleEMP001BrowserSales(
        f.request(),
        { ...f.env, SALES_OPS_TENANT_ID: "tenant-b" },
        f.fetcher
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleEMP001BrowserSales(
        f.request(),
        { ...f.env, SALES_OPS_TOKEN: undefined },
        f.fetcher
      )
    ).status,
    503
  );
  assert.equal(f.calls.length, 0);
});
test("foreign or malformed catalog response is not exposed", async () => {
  const f = await fixture();
  for (const data of [
    { ok: true, tenant_id: "tenant-b", products: [] },
    { ok: true, tenant_id: "tenant-a", products: [{ tenant_id: "tenant-b" }] },
    {
      ok: true,
      tenant_id: "tenant-a",
      products: [
        {
          tenant_id: "tenant-a",
          sku: "x",
          name: "x",
          price_gs: "invalid",
          stock_qty: 1
        }
      ]
    }
  ]) {
    f.setResponse(data);
    assert.equal(
      (await handleEMP001BrowserSales(f.request(), f.env, f.fetcher)).status,
      502
    );
  }
});
test("independent order GET checks every line tenant and order ID", async () => {
  const f = await fixture();
  const order = {
    id: "order1",
    tenant_id: "tenant-a",
    status: "PAYMENT_PENDING",
    total_gs: 25000,
    created_at: "2026-10-27T12:00:00Z",
    lines: [
      {
        tenant_id: "tenant-a",
        order_id: "order1",
        sku: "sku1",
        qty: 1,
        unit_price_gs: 25000,
        line_total_gs: 25000
      }
    ]
  };
  f.setResponse({ ok: true, order });
  let r = await handleEMP001BrowserSales(
    f.request("?orderId=order1"),
    f.env,
    f.fetcher
  );
  assert.equal(r.status, 200);
  assert.equal(new URL(f.calls[0].url).pathname, "/api/v1/orders/order1");
  assert.equal(
    ((await r.json()) as { order: { totalGs: number } }).order.totalGs,
    25000
  );
  f.setResponse({
    ok: true,
    order: { ...order, lines: [{ ...order.lines[0], tenant_id: "tenant-b" }] }
  });
  r = await handleEMP001BrowserSales(
    f.request("?orderId=order1"),
    f.env,
    f.fetcher
  );
  assert.equal(r.status, 502);
});

test("server-only multi-tenant credentials route A and deny ambiguous mappings", async () => {
  const f = await fixture();
  const credentials = JSON.stringify([
    { tenantId: "tenant-a", token: "token-a" },
    { tenantId: "tenant-b", token: "token-b" }
  ]);
  const env = { ...f.env, SALES_OPS_CREDENTIALS_JSON: credentials };
  const success = await handleEMP001BrowserSales(f.request(), env, f.fetcher);
  assert.equal(success.status, 200);
  assert.equal(f.calls.at(-1)?.headers.get("authorization"), "Bearer token-a");
  assert.equal(f.calls.at(-1)?.headers.get("x-tenant-id"), "tenant-a");
  const calls = f.calls.length;
  for (const malformed of [
    JSON.stringify([{ tenantId: "tenant-b", token: "token-b" }]),
    JSON.stringify([{ tenantId: "tenant-a", token: "shared" }, { tenantId: "tenant-b", token: "shared" }]),
    JSON.stringify([{ tenantId: "tenant-a", token: "first" }, { tenantId: "tenant-a", token: "second" }]),
    "not-json"
  ]) {
    const denied = await handleEMP001BrowserSales(f.request(), {
      ...env, SALES_OPS_CREDENTIALS_JSON: malformed
    }, f.fetcher);
    assert.equal(denied.status, 403);
  }
  assert.equal(f.calls.length, calls);
});

test("independent B identity uses only B credential and rejects A upstream data", async () => {
  const f = await fixture();
  const { webcrypto } = await import("node:crypto");
  const pair = await webcrypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const data = encode({ alg: "RS256", kid: "b-key" }) + "." + encode({
    iss: "https://sales-test.cloudflareaccess.com", aud: "sales",
    email: "b@test.invalid", iat: now - 5, exp: now + 600
  });
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data)
  );
  const jwt = data + "." + Buffer.from(signature).toString("base64url");
  const calls: Request[] = [];
  let returnForeign = false;
  const env = {
    ...f.env,
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      { email: "b@test.invalid", actorId: "actor-b", tenantId: "tenant-b", role: "owner" }
    ]),
    SALES_OPS_CREDENTIALS_JSON: JSON.stringify([
      { tenantId: "tenant-a", token: "token-a" },
      { tenantId: "tenant-b", token: "token-b" }
    ]),
    SALES_OPS: { fetch: async (request: Request) => {
      calls.push(request);
      const tenant = returnForeign ? "tenant-a" : "tenant-b";
      return Response.json({ ok: true, tenant_id: tenant, products: [{
        tenant_id: tenant, sku: "sku-b", name: "B", price_gs: 100, stock_qty: 1
      }] });
    } }
  };
  const fetcher = (async () => Response.json({
    keys: [{ ...jwk, kid: "b-key", alg: "RS256", use: "sig" }]
  })) as typeof fetch;
  const request = new Request("https://portal.test/api/emp001/operations", {
    headers: { "cf-access-jwt-assertion": jwt }
  });
  const success = await handleEMP001BrowserSales(request, env, fetcher);
  assert.equal(success.status, 200);
  assert.equal((await success.json() as { tenantId: string }).tenantId, "tenant-b");
  assert.equal(calls[0].headers.get("authorization"), "Bearer token-b");
  assert.equal(calls[0].headers.get("x-tenant-id"), "tenant-b");
  returnForeign = true;
  const foreign = await handleEMP001BrowserSales(request, env, fetcher);
  assert.equal(foreign.status, 502);
  assert.equal(JSON.stringify(await foreign.json()).includes("sku-b"), false);
});
