import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { EMP003CopyLibrary } from "./emp003-copy-library";
import {
  copyAuth,
  copyFixture,
  copyBlueprint,
  copyContext
} from "./runtime/emp003-copy-fixture.test-support";
import { handleEMP003CopyAssets } from "./runtime/emp003-copy-routes";
import { handleEMP003CopyDO } from "./runtime/emp003-copy-do";
import { createPersistentBlueprintRepository } from "./core/marketing-blueprint-persistent";
import { createEMP003DurableStorageAdapter } from "./runtime/emp003-durable-storage";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
const dom = new JSDOM("<div id='root'></div>", { url: "https://pilot.test" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true
});
const flush = async () => {
  const deadline = Date.now() + 5000;
  do {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const refresh = [...document.querySelectorAll("button")].find(
      (x) => x.textContent?.trim() === "Actualizar campañas de biblioteca"
    );
    if (refresh && !refresh.disabled) return;
  } while (Date.now() < deadline);
  assert.fail("Copy UI did not finish its visible operation within 5s");
};
const button = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (x) => x.textContent?.trim() === name
  )!;
async function select(label: string, value: string) {
  const el = [...document.querySelectorAll("label")]
    .find((x) => x.firstChild?.textContent?.trim() === label)!
    .querySelector("select")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLSelectElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
  await flush();
}
async function click(name: string) {
  assert.ok(button(name), name);
  await act(async () => button(name).click());
  await flush();
}

test("portal selection→authenticated BFF→SQLite assets→independent byte read-back→reload/history/error", async () => {
  const { createRoot } = await import("react-dom/client");
  const auth = await copyAuth();
  const f = copyFixture();
  let calls = 0;
  let role = "owner";
  let loseResponse = false;
  let deny = false;
  await createPersistentBlueprintRepository(
    createEMP003DurableStorageAdapter(f.storage)
  ).put("tenant-a", "campaign", copyBlueprint);
  await f.storage.put("emp003:draft-revision:tenant-a:campaign", 1);
  const env = {
    WORKFORCE_ACCESS_TEAM_DOMAIN: "copy.cloudflareaccess.com",
    WORKFORCE_ACCESS_AUDIENCE: "copy",
    ACCESS_IDENTITY_MAP_JSON: JSON.stringify([
      { email: "a@test.invalid", actorId: "a", tenantId: "tenant-a", role }
    ]),
    EMP003_CAMPAIGN_STATE: {
      idFromName: (x: string) => x,
      get() {
        return {
          fetch: (request: Request) =>
            handleEMP003CopyDO(
              request,
              f.storage as unknown as DurableObjectStorage,
              {
                AI: {} as Ai,
                EMP003_ASSET_BUCKET: f.bucket,
                EMP003_COPY_CONTEXTS_JSON: JSON.stringify([copyContext])
              },
              {
                async generate() {
                  calls++;
                  return {
                    headline: `Copy ${calls}`,
                    body: "Consultanos por el servicio.",
                    claimIds: ["claim"]
                  };
                }
              }
            )
        };
      }
    }
  };
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://pilot.test");
    urls.push(url.pathname + url.search);
    if (url.pathname === "/api/emp003/operations")
      return Response.json({
        ok: true,
        tenantId: "tenant-a",
        permissions: { canWrite: role === "owner" },
        campaigns: [
          {
            campaignId: "campaign",
            blueprint: copyBlueprint,
            reviewState: "DRAFT",
            reviewRevision: 0,
            requiresOwnerReview: true,
            publishAuthorized: false,
            publishExecuted: false
          }
        ]
      });
    if (deny && url.pathname.endsWith("/context"))
      return Response.json(
        { ok: false, error: "COPY_CONTEXT_NOT_CONFIGURED" },
        { status: 503 }
      );
    const headers = new Headers(init?.headers);
    headers.set("cf-access-jwt-assertion", auth.a);
    const response = await handleEMP003CopyAssets(
      new Request(url, { ...init, headers }),
      env,
      auth.fetcher
    );
    if (loseResponse && url.pathname.endsWith("/generate")) {
      loseResponse = false;
      throw Error("Failed to fetch");
    }
    return response;
  }) as typeof fetch;
  let root = createRoot(document.getElementById("root")!);
  const mount = async () => {
    await act(async () => root.render(createElement(EMP003CopyLibrary)));
    await flush();
    await select("Campaña para assets", "campaign");
  };
  try {
    await mount();
    await click("Generar copy con IA");
    assert.equal(calls, 1);
    assert.match(document.querySelector("pre")!.textContent!, /Copy 1/);
    assert.match(document.body.textContent!, /hash verificado/);
    assert.ok(
      urls.some((x) => x.includes("/content?") && x.includes("revision=1"))
    );
    await click("Generar copy con IA · nueva versión");
    assert.equal(calls, 2);
    await select("Versión del asset", "1");
    assert.match(document.querySelector("pre")!.textContent!, /Copy 1/);
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    await mount();
    const record = JSON.parse(
      (await f.storage.get<string>(
        [
          ...(
            await f.storage.list({ prefix: "emp003:assets:tenant-a:campaign:" })
          ).keys()
        ].find((x) => x.endsWith(":head"))!
      ))!
    );
    await click(`${record.assetId} · Email · versión 2`);
    assert.match(document.querySelector("pre")!.textContent!, /Copy 2/);
    loseResponse = true;
    await click("Generar copy con IA · nueva versión");
    assert.equal(calls, 3);
    assert.match(document.body.textContent!, /Failed to fetch/);
    assert.ok(button("Consultar operación"));
    await click("Consultar operación");
    assert.equal(calls, 3);
    assert.match(document.body.textContent!, /Asset registrado/);
    record.revision = 3;
    const head = JSON.parse(
      (await f.storage.get<string>(
        [
          ...(
            await f.storage.list({ prefix: "emp003:assets:tenant-a:campaign:" })
          ).keys()
        ].find((x) => x.endsWith(":head"))!
      ))!
    );
    f.objects.set(head.objectKey, new TextEncoder().encode("tampered"));
    await click(`${record.assetId} · Email · versión 3`);
    assert.ok(document.querySelector("[role=alert]"));
    assert.equal(document.querySelector("pre")?.textContent, "");
    assert.doesNotMatch(document.body.textContent!, /hash verificado/);
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    role = "user";
    await mount();
    assert.equal(button("Generar copy con IA").disabled, true);
    assert.match(document.body.textContent!, /permiso de lectura/);
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    deny = true;
    await mount();
    assert.match(
      document.querySelector("[role=alert]")!.textContent!,
      /fuentes verificadas/
    );
    assert.equal(button("Generar copy con IA").disabled, true);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = original;
    sessionStorage.clear();
    f.db.close();
  }
});
