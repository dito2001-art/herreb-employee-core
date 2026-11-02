import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { EMP003CopyGovernance } from "./emp003-copy-governance";
import { copyContext } from "./runtime/emp003-copy-fixture.test-support";
import type { MarketingAssetVersion } from "./core/marketing-asset-library";
const originalRecord: MarketingAssetVersion = {
  tenantId: "tenant-a",
  campaignId: "campaign",
  assetId: "copy",
  revision: 1,
  kind: "COPY",
  channel: "Email",
  mimeType: "text/plain",
  objectKey: "emp003/tenant-a/campaign/copy/" + "a".repeat(64),
  sha256: "a".repeat(64),
  bytes: 8,
  createdAt: "2026-10-29T00:00:00Z",
  evidenceRefs: ["knowledge:knowledge"],
  status: "DRAFT",
  publishExecuted: false
};
test(
  "copy governance sends exact CAS/context, preserves ambiguous intent and verifies approval independently",
  { timeout: 10000 },
  async () => {
    const { JSDOM } = createRequire(import.meta.url)("jsdom");
    const dom = new JSDOM("<div id='root'></div>", {
      url: "https://pilot.test"
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      sessionStorage: dom.window.sessionStorage,
      IS_REACT_ACT_ENVIRONMENT: true
    });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const oldFetch = globalThis.fetch;
    let lose = true;
    let owner = true;
    let approval: Record<string, unknown> | null = null;
    let liveRecord = originalRecord;
    let text = "Original";
    const edits: unknown[] = [];
    const brand = {
      tenantId: "tenant-a",
      revision: 1,
      hash: "b".repeat(64),
      brand: copyContext.brand,
      claims: [
        { id: "claim", text: "Verificado", sourceKnowledgeIds: ["knowledge"] }
      ],
      restrictions: copyContext.brand.prohibitedThemes,
      source: "SERVER_CONFIGURATION",
      editable: false,
      publicationEnabled: false
    };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      assert.equal(init?.credentials, "same-origin");
      assert.equal(init?.cache, "no-store");
      if (url.endsWith("/brand-brain")) return Response.json(brand);
      if (url.includes("/approval?"))
        return Response.json({ ok: true, approval, active: !!approval });
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(init?.method, "POST");
      if (url.endsWith("/edit")) {
        edits.push(body);
        if (lose) {
          lose = false;
          throw Error("Failed to fetch");
        }
        return Response.json({
          ok: true,
          readBackConfirmed: true,
          record: { ...originalRecord, revision: 2, sha256: "c".repeat(64) }
        });
      }
      assert.ok(url.endsWith("/approve"));
      assert.equal(body.revision, 2);
      assert.equal(body.sha256, "c".repeat(64));
      assert.equal(body.contextHash, brand.hash);
      approval = {
        tenantId: "tenant-a",
        campaignId: "campaign",
        assetId: "copy",
        revision: 2,
        sha256: "c".repeat(64),
        campaignRevision: 1,
        contextRevision: 1,
        contextHash: brand.hash,
        claimIds: ["claim"],
        approvedBy: "a",
        approvedAt: "2026-10-29T00:00:00Z",
        status: "APPROVED",
        publishExecuted: false
      };
      return Response.json({ ok: true, approval });
    }) as typeof fetch;
    const flush = async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
    };
    const render = async () => {
      await act(async () =>
        root.render(
          createElement(EMP003CopyGovernance, {
            key: liveRecord.revision,
            asset: liveRecord,
            text,
            campaignRevision: 1,
            canWrite: owner,
            onSaved: async (record) => {
              liveRecord = record;
              text = "Editado";
            }
          })
        )
      );
      await flush();
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
      await render();
      const area = document.querySelector("textarea")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLTextAreaElement.prototype,
          "value"
        )!.set!.call(area, "Editado");
        area.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
      await flush();
      assert.equal(
        [...document.querySelectorAll("button")].find(
          (x) => x.textContent === "Guardar nueva revisión"
        )!.disabled,
        false
      );
      await click("Guardar nueva revisión");
      assert.match(document.body.textContent!, /Conservamos la solicitud/);
      assert.equal(edits.length, 1);
      await act(async () => root.render(null));
      await render();
      await click("Recuperar operación pendiente sin IA");
      assert.equal(edits.length, 2);
      assert.deepEqual(edits[0], edits[1]);
      assert.equal(liveRecord.revision, 2);
      assert.equal(
        sessionStorage.getItem("emp003-copy-governance:tenant-a:campaign:copy"),
        null
      );
      await render();
      const checkbox = document.querySelector(
        'input[type="checkbox"]'
      ) as HTMLInputElement;
      await act(async () => checkbox.click());
      await flush();
      await click("Aprobar revisión exacta");
      assert.match(
        document.body.textContent!,
        /Revisión exacta aprobada y recuperada/
      );
      assert.match(document.body.textContent!, /hash exactos/);
      owner = false;
      await render();
      assert.equal(
        (document.querySelector("textarea") as HTMLTextAreaElement).disabled,
        true
      );
      assert.equal(
        [...document.querySelectorAll("button")].find(
          (x) => x.textContent === "Guardar nueva revisión"
        )!.disabled,
        true
      );
      owner = true;
      brand.tenantId = "tenant-b";
      await act(async () => root.render(null));
      await render();
      assert.match(document.body.textContent!, /alcance inválido/);
      assert.doesNotMatch(document.body.textContent!, /Verificado · Fuentes/);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = oldFetch;
      dom.window.close();
    }
  }
);
