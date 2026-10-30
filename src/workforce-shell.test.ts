import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { WorkforceShell } from "./workforce-shell";

test(
  "one portal reaches sales readback, native agenda and the complete marketer workspace",
  { timeout: 10000 },
  async () => {
    const { JSDOM } = createRequire(import.meta.url)("jsdom");
    const dom = new JSDOM("<div id='root'></div>", {
      url: "https://portal.test"
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      sessionStorage: dom.window.sessionStorage,
      IS_REACT_ACT_ENVIRONMENT: true
    });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url, init) => {
      requests.push(String(url));
      if (String(url) === "/api/emp001/operations")
        return Response.json({ ok: true, products: [] });
      if (String(url) === "/api/emp002/calendar") {
        assert.equal(init?.method, "POST");
        return Response.json({
          ok: true,
          tenantId: "tenant-a",
          canWrite: true,
          entries: []
        });
      }
      if (String(url) === "/api/emp003/operations")
        return Response.json({
          ok: true,
          tenantId: "tenant-a",
          permissions: { canWrite: true },
          campaigns: []
        });
      if (String(url).endsWith("/brand-brain"))
        return Response.json({ ok: false }, { status: 503 });
      throw Error("Unexpected route: " + url);
    }) as typeof fetch;
    const flush = async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    const click = async (name: string) => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === name
      );
      assert.ok(button, name);
      await act(async () => button.click());
      await flush();
    };
    try {
      await act(async () => root.render(createElement(WorkforceShell)));
      await click("EMP-002");
      assert.match(
        document.body.textContent!,
        /Chat del asistente no conectado/
      );
      assert.doesNotMatch(document.body.textContent!, /Assistant/);
      await click("Admin");
      assert.match(document.body.textContent!, /Administración no habilitada/);
      assert.ok(
        !requests.some(
          (path) => path.includes("/api/admin/") || path.includes("/agents/")
        )
      );
      await click("EMP-001");
      await click("Consultar catálogo");
      assert.match(document.body.textContent!, /No hay productos activos/);
      await click("Agenda y tareas");
      assert.ok(
        [...document.querySelectorAll("label")].some((l) =>
          l.textContent?.includes("Recordatorio (hora de Asunción")
        )
      );
      await click("EMP-003");
      assert.ok(
        document.querySelector('nav[aria-label="Secciones de marketing"]')
      );
      await click("Creative Studio");
      assert.ok(
        document.querySelector(
          'section[aria-label="Creative Studio conectado"]'
        )
      );
      await click("Calendario");
      assert.ok(
        document.querySelector('section[aria-label="Calendario de campañas"]')
      );
      assert.ok(requests.includes("/api/emp001/operations"));
      assert.ok(requests.includes("/api/emp002/calendar"));
      assert.ok(requests.includes("/api/emp003/operations"));
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = original;
      dom.window.close();
    }
  }
);
