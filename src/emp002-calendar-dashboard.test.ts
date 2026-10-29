import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, act } from "react";
import { EMP002CalendarDashboard } from "./emp002-calendar-dashboard";

test(
  "native calendar form saves, reloads and clears reminders; a failed reload revokes stale write controls",
  { timeout: 10000 },
  async () => {
    const { JSDOM } = createRequire(import.meta.url)("jsdom");
    const dom = new JSDOM("<div id='root'></div>", {
      url: "https://portal.test"
    });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      IS_REACT_ACT_ENVIRONMENT: true
    });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root")!);
    const originalFetch = globalThis.fetch;
    const entries = new Map<string, Record<string, unknown>>();
    const writes: Record<string, unknown>[] = [];
    let fail = false;
    globalThis.fetch = (async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      if (fail) return Response.json({ ok: false }, { status: 401 });
      if (input.operation === "save") {
        const previous = entries.get(input.entry.id);
        if ((previous?.version ?? 0) !== input.expectedVersion)
          return Response.json({ ok: false }, { status: 409 });
        const entry = {
          ...input.entry,
          tenantId: "tenant-a",
          version: input.expectedVersion + 1,
          updatedAt: "2026-10-29T00:00:00Z"
        };
        entries.set(entry.id, entry);
        writes.push(input);
        return Response.json({ ok: true, entry, readBackConfirmed: true });
      }
      if (input.operation === "get")
        return Response.json({ ok: true, entry: entries.get(input.id) });
      return Response.json({
        ok: true,
        tenantId: "tenant-a",
        canWrite: true,
        entries: [...entries.values()].filter(
          (e) =>
            e.status === "ACTIVE" &&
            (input.operation !== "reminders" || e.reminderAt)
        )
      });
    }) as typeof fetch;
    const flush = async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    const button = (name: string) =>
      [...document.querySelectorAll("button")].find(
        (b) => b.textContent === name
      )!;
    const input = (label: string) =>
      [...document.querySelectorAll("label")]
        .find((l) => l.textContent?.trim() === label)!
        .querySelector("input")!;
    const fill = async (label: string, value: string) => {
      await act(async () => {
        const el = input(label);
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value"
        )!.set!.call(el, value);
        el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });
    };
    const click = async (name: string) => {
      assert.ok(button(name), name);
      await act(async () => button(name).click());
      await flush();
    };
    try {
      await act(async () =>
        root.render(createElement(EMP002CalendarDashboard))
      );
      await flush();
      assert.ok(document.querySelector('input[type="datetime-local"]'));
      await fill("Título", "Seguimiento Cliente 0");
      await fill("Inicio", "2026-11-01T09:00");
      await fill("Fin", "2026-11-01T10:00");
      await fill(
        "Recordatorio (hora de Asunción, opcional)",
        "2026-11-01T08:30"
      );
      await click("Guardar y verificar");
      assert.equal(writes.length, 1);
      const saved = [...entries.values()][0];
      assert.equal(saved.startsAt, "2026-11-01T12:00:00.000Z");
      assert.equal(saved.reminderAt, "2026-11-01T11:30:00.000Z");
      assert.match(document.body.textContent!, /Entrada guardada y verificada/);
      await click("Recargar");
      await click("Editar");
      assert.equal(
        input("Recordatorio (hora de Asunción, opcional)").value,
        "2026-11-01T08:30"
      );
      await click("Quitar recordatorio");
      await click("Guardar y verificar");
      const cleared = [...entries.values()][0];
      assert.equal(cleared.version, 2);
      assert.equal(cleared.reminderAt, undefined);
      fail = true;
      await click("Recargar");
      assert.equal(document.querySelector("form"), null);
      assert.equal(button("Editar"), undefined);
      assert.match(document.body.textContent!, /No tenés permiso/);
      assert.equal(writes.length, 2);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = originalFetch;
      dom.window.close();
    }
  }
);
