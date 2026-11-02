import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { buildEMP003Workspace } from "./core/emp003-workspace-view";
import { copyBlueprint } from "./runtime/emp003-copy-fixture.test-support";
import { EMP003Workspace } from "./emp003-workspace";
const payload = (tenantId = "tenant-a", canWrite = true) => ({
  ok: true,
  tenantId,
  permissions: { canWrite },
  campaigns: [
    {
      campaignId: "campaign",
      blueprint: {
        ...copyBlueprint,
        tenantId,
        name: "Persisted campaign",
        schedule: { startDate: "2026-10-28", endDate: "2026-11-02" }
      },
      reviewState: "DRAFT",
      reviewRevision: 0,
      requiresOwnerReview: true,
      publishAuthorized: false,
      publishExecuted: false
    }
  ]
});
test("calendar uses persisted date strings and validates tenant, duplicates and publication fences", () => {
  const view = buildEMP003Workspace(payload());
  assert.equal(view.calendar[0].startDate, "2026-10-28");
  assert.equal(view.calendar[0].name, "Persisted campaign");
  const bad = payload();
  bad.campaigns[0].blueprint.tenantId = "tenant-b";
  assert.throws(() => buildEMP003Workspace(bad), /SCOPE_REJECTED/);
  const duplicate = payload();
  duplicate.campaigns.push(duplicate.campaigns[0]);
  assert.throws(() => buildEMP003Workspace(duplicate), /DUPLICATE/);
  assert.throws(() =>
    buildEMP003Workspace({ ...payload(), permissions: undefined })
  );
  const published = payload();
  Object.assign(published.campaigns[0], { publishExecuted: true });
  assert.throws(() => buildEMP003Workspace(published));
});
test("workspace reuses real UI modules, stays read-only for B and clears previous tenant after an auth failure", async () => {
  const { JSDOM } = createRequire(import.meta.url)("jsdom");
  const dom = new JSDOM("<div id='root'></div>", { url: "https://pilot.test" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true
  });
  const { createRoot } = await import("react-dom/client");
  const original = globalThis.fetch;
  const requests: string[] = [];
  let denied = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requests.push(String(url));
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    if (String(url) === "/api/emp003/assets/brand-brain")
      return Response.json({ ok: false }, { status: 503 });
    assert.equal(String(url), "/api/emp003/operations");
    return denied
      ? Response.json({ ok: false }, { status: 401 })
      : Response.json(payload("tenant-b", false));
  }) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  const flush = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  };
  const click = async (name: string) => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.textContent === name
    );
    assert.ok(b, name);
    await act(async () => b.click());
    await flush();
  };
  try {
    await act(async () => root.render(createElement(EMP003Workspace)));
    await flush();
    await flush();
    assert.match(document.body.textContent!, /tenant-b/);
    assert.match(document.body.textContent!, /Solo lectura/);
    assert.equal(document.querySelector('select[aria-label="Tenant"]'), null);
    await click("Campañas y aprobaciones");
    const create = [...document.querySelectorAll("button")].find(
      (x) => x.textContent === "Nueva campaña"
    )!;
    assert.equal(create.disabled, true);
    await click("Creative Studio");
    assert.match(
      document.querySelector('section[aria-label="Creative Studio conectado"]')!
        .textContent!,
      /Copy real con Workers AI/
    );
    await click("Calendario");
    const calendar = document.querySelector(
      'section[aria-label="Calendario de campañas"]'
    )!;
    assert.equal(calendar.hasAttribute("hidden"), false);
    assert.match(calendar.textContent!, /Persisted campaign/);
    assert.match(calendar.textContent!, /2026-10-28/);
    denied = true;
    await click("Actualizar resumen y calendario");
    assert.ok(document.querySelector('[role="alert"]'));
    assert.doesNotMatch(
      document.body.textContent!,
      /tenant-b|Persisted campaign/
    );
    assert.ok(requests.length >= 3);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = original;
    dom.window.close();
  }
});
