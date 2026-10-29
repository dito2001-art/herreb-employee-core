import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { EMP003CampaignDashboard } from "./emp003-campaign-dashboard";
import { copyBlueprint } from "./runtime/emp003-copy-fixture.test-support";
import { hashEMP003Blueprint } from "./core/emp003-blueprint-pin";
test(
  "review UI pins the exact displayed blueprint revision/hash and displays the checked receipt",
  { timeout: 10000 },
  async () => {
    const { JSDOM } = createRequire(import.meta.url)("jsdom");
    const dom = new JSDOM("<div id='root'></div>", {
      url: "https://pilot.test"
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true
    });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const old = globalThis.fetch;
    let state = "DRAFT";
    let pinned: Record<string, unknown> | undefined;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("operations"))
        return Response.json({
          ok: true,
          tenantId: "tenant-a",
          permissions: { canWrite: true },
          campaigns: [
            {
              campaignId: "campaign",
              blueprint: copyBlueprint,
              reviewState: state,
              reviewRevision: 0,
              requiresOwnerReview: true,
              publishAuthorized: false,
              publishExecuted: false
            }
          ]
        });
      if (url.includes("/drafts?"))
        return Response.json({
          ok: true,
          found: true,
          tenantId: "tenant-a",
          campaignId: "campaign",
          campaign: copyBlueprint,
          revision: 3
        });
      assert.ok(url.endsWith("/review"));
      pinned = JSON.parse(String(init?.body));
      assert.equal(pinned!.blueprintRevision, 3);
      assert.equal(
        pinned!.blueprintHash,
        await hashEMP003Blueprint(copyBlueprint)
      );
      state = "IN_REVIEW";
      return Response.json({
        ok: true,
        readBackConfirmed: true,
        blueprintPin: {
          tenantId: "tenant-a",
          campaignId: "campaign",
          revision: 3,
          sha256: pinned!.blueprintHash,
          idempotencyKey: pinned!.idempotencyKey,
          correlationId: pinned!.idempotencyKey
        }
      });
    }) as typeof fetch;
    const flush = async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    const click = async (name: string) => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.textContent?.trim() === name
      );
      assert.ok(b, name);
      await act(async () => b.click());
      await flush();
    };
    try {
      await act(async () =>
        root.render(createElement(EMP003CampaignDashboard))
      );
      await flush();
      await click("Campaña noviembre · Borrador");
      const input = [...document.querySelectorAll("label")]
        .find(
          (x) => x.firstChild?.textContent?.trim() === "Motivo de revisión"
        )!
        .querySelector("input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, "Contenido verificado");
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await click("Enviar a revisión");
      assert.ok(pinned);
      assert.match(document.body.textContent!, /versión 3 · SHA-256/);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = old;
      dom.window.close();
    }
  }
);
