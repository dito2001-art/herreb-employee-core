import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { EMP003CampaignDashboard } from "./emp003-campaign-dashboard";
const { JSDOM } = createRequire(import.meta.url)("jsdom");
const dom = new JSDOM("<div id='root'></div>", {
  url: "https://pilot.example"
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true
});
const blueprint = {
  tenantId: "herreb-client-0",
  correlationId: "corr",
  objective: "Conseguir consultas",
  audiences: ["Empresas"],
  positioning: "Automatización",
  keyMessages: ["Probá el piloto"],
  channels: [{ name: "Email", actions: ["Preparar borrador"] }],
  kpis: [{ metric: "Consultas", target: "10", measurement: "CRM" }],
  assumptions: [],
  evidenceRefs: ["https://developers.cloudflare.com/"],
  status: "DRAFT",
  publishApproved: false
};
const getButton = (name: string) =>
  [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === name
  )!;
const getInput = (name: string) =>
  [...document.querySelectorAll("label")]
    .find((el) => el.childNodes[0]?.textContent?.trim() === name)!
    .querySelector("input,textarea") as HTMLInputElement;
async function fill(name: string, value: string) {
  const el = getInput(name);
  const proto =
    el.tagName === "TEXTAREA"
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
async function click(name: string) {
  await act(async () => getButton(name).click());
}

test("campaign editor: empty tenant, AI, independent read-back, conflict, approved and read-only", async (t) => {
  const { createRoot } = await import("react-dom/client");
  let stored: Record<string, unknown> | undefined;
  let currentRevision = 0;
  let reviewState = "DRAFT";
  let canWrite = true;
  let stale = false;
  let failed = false;
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    const path = String(url);
    calls.push(`${init?.method ?? "GET"} ${path}`);
    if (failed) return Response.json({ error: "unavailable" }, { status: 503 });
    if (path.endsWith("operations"))
      return Response.json({
        ok: true,
        tenantId: "herreb-client-0",
        permissions: { canWrite },
        campaigns: stored
          ? [
              {
                campaignId: "saved",
                blueprint: stored,
                reviewState,
                reviewRevision: currentRevision,
                requiresOwnerReview:
                  reviewState === "DRAFT" || reviewState === "IN_REVIEW",
                publishAuthorized: false,
                publishExecuted: false
              }
            ]
          : []
      });
    if (path.endsWith("generate-campaign"))
      return Response.json({
        ok: true,
        tenantId: "herreb-client-0",
        blueprint,
        persisted: false,
        publishExecuted: false
      });
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (stale) return Response.json({ error: "conflict" }, { status: 409 });
      assert.equal(body.expectedRevision, currentRevision || undefined);
      stored = body.blueprint;
      currentRevision++;
      return Response.json({
        ok: true,
        revision: currentRevision,
        readBackConfirmed: true
      });
    }
    const id = new URL(path, "https://pilot.example").searchParams.get(
      "campaignId"
    );
    return Response.json({
      ok: true,
      found: true,
      campaignId: id,
      campaign: stored,
      revision: currentRevision
    });
  }) as typeof fetch;
  let root = createRoot(document.getElementById("root")!);
  const mount = async () => {
    await act(async () => root.render(createElement(EMP003CampaignDashboard)));
  };
  const remount = async () => {
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    await mount();
  };
  try {
    await t.test("empty owner sees the editor immediately", async () => {
      await mount();
      assert.ok(
        document.querySelector('article[aria-label="Editor de campaña"]')
      );
      assert.equal(getButton("Nueva campaña").disabled, false);
    });
    await t.test(
      "AI proposal preserves campaign name/dates and remains unsaved",
      async () => {
        await fill("Nombre de la campaña", "Piloto noviembre");
        await fill("Fecha de inicio", "2026-11-01");
        await fill("Fecha de fin", "2026-11-30");
        await fill("Objetivo comercial", "Conseguir consultas");
        await fill("Tema para la propuesta", "Piloto");
        await fill(
          "Fuentes HTTPS (una por línea)",
          "https://developers.cloudflare.com/"
        );
        await click("Generar propuesta con IA");
        assert.equal(
          getInput("Nombre de la campaña").value,
          "Piloto noviembre"
        );
        assert.equal(getInput("Fecha de fin").value, "2026-11-30");
        assert.equal(stored, undefined);
      }
    );
    await t.test(
      "save performs a separate GET and preserves metadata",
      async () => {
        await click("Guardar borrador");
        assert.equal(stored?.name, "Piloto noviembre");
        assert.deepEqual(stored?.schedule, {
          startDate: "2026-11-01",
          endDate: "2026-11-30"
        });
        assert.ok(calls.some((x) => x.startsWith("GET /api/emp003/drafts?")));
        assert.match(
          document.body.textContent ?? "",
          /Campaña guardada y verificada/
        );
      }
    );
    await t.test("remount and open restore persisted campaign", async () => {
      await remount();
      await click("Piloto noviembre · Borrador");
      assert.equal(getInput("Nombre de la campaña").value, "Piloto noviembre");
    });
    await t.test(
      "stale CAS blocks another save until authoritative reload",
      async () => {
        stale = true;
        await click("Guardar borrador");
        assert.equal(getButton("Guardar borrador").disabled, true);
        assert.match(document.body.textContent ?? "", /Volvé a cargarla/);
        stale = false;
        await click("Recargar campaña");
        assert.equal(getButton("Guardar borrador").disabled, false);
      }
    );
    await t.test("approved campaign is read-only", async () => {
      reviewState = "APPROVED";
      await remount();
      await click("Piloto noviembre · Aprobada");
      assert.equal(getInput("Nombre de la campaña").disabled, true);
      assert.equal(getButton("Guardar borrador").disabled, true);
    });
    await t.test(
      "read-only tenant has no creation controls enabled",
      async () => {
        stored = undefined;
        canWrite = false;
        await remount();
        assert.equal(getButton("Nueva campaña").disabled, true);
        assert.equal(document.querySelector("article"), null);
        assert.match(document.body.textContent ?? "", /Solo el propietario/);
      }
    );
    await t.test(
      "load failure is not presented as an empty successful account",
      async () => {
        failed = true;
        await remount();
        assert.ok(document.querySelector('[role="alert"]'));
        assert.doesNotMatch(
          document.body.textContent ?? "",
          /Todavía no hay campañas/
        );
      }
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
