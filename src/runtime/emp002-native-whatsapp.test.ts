import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { EMP002Operations } from "./emp002-operations";
import { resolveEMP002CalendarQueryWindow } from "./emp002-calendar-query";
import { workforceInstant } from "../core/workforce-calendar-time";

test(
  "owner WhatsApp creates, updates and cancels the same native agenda in Asuncion without duplicate sends",
  { timeout: 10000 },
  async () => {
    const db = new DatabaseSync(":memory:");
    const sql = {
      exec(query: string, ...args: unknown[]) {
        const s = db.prepare(query);
        return s.columns().length
          ? s.all(...(args as never[]))
          : (s.run(...(args as never[])), []);
      }
    };
    const state = {
      storage: {
        sql,
        transactionSync<T>(fn: () => T) {
          db.exec("BEGIN");
          try {
            const r = fn();
            db.exec("COMMIT");
            return r;
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        }
      }
    };
    let command: unknown = { operation: "none" };
    const env = {
      TENANT_MANIFESTS_JSON: JSON.stringify([
        { tenantId: "tenant-a", whatsappOwners: ["595981000000"] }
      ]),
      META_ACCESS_TOKEN: "test-only",
      META_PHONE_NUMBER_ID: "test-only",
      AI: {
        async run() {
          return { response: JSON.stringify(command) };
        }
      }
    };
    const original = globalThis.fetch;
    let sends = 0;
    globalThis.fetch = (async (url) => {
      assert.match(String(url), /^https:\/\/graph.facebook.com\//);
      sends++;
      return Response.json({ messages: [{ id: `wamid.test${sends}` }] });
    }) as typeof fetch;
    const call = (
      path: string,
      body: unknown,
      headers: Record<string, string> = {}
    ) =>
      new EMP002Operations(state as never, env).fetch(
        new Request("https://internal" + path, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(body)
        })
      );
    const inbound = (messageId: string, body: string, from = "595981000000") =>
      call("/inbound/whatsapp", {
        tenantId: "tenant-a",
        messageId,
        body,
        from,
        receivedAt: new Date().toISOString()
      });
    try {
      const day = resolveEMP002CalendarQueryWindow("hoy").timeMin.slice(0, 10);
      let r = await inbound(
        "one",
        'Agendá "Cliente Cero" hoy a las 9 duración 60 min'
      );
      assert.equal(r.status, 200, await r.clone().text());
      r = await call(
        "/native-calendar",
        { operation: "get", id: "wa-one" },
        { "x-herreb-internal-tenant-id": "tenant-a" }
      );
      let saved = (await r.json()) as {
        entry: { startsAt: string; version: number; status: string };
      };
      assert.equal(saved.entry.startsAt, workforceInstant(day + "T09:00"));
      assert.equal(
        (
          await inbound(
            "one",
            'Agendá "Cliente Cero" hoy a las 9 duración 60 min'
          )
        ).status,
        200
      );
      assert.equal(sends, 1);
      command = {
        operation: "update",
        query: "Cliente Cero",
        changes: { startTime: day + "T10:00:00", endTime: day + "T11:00:00" }
      };
      r = await inbound(
        "two",
        "Reprogramá la reunión Cliente Cero hoy a las 10"
      );
      assert.equal(r.status, 200, await r.clone().text());
      r = await call(
        "/native-calendar",
        { operation: "get", id: "wa-one" },
        { "x-herreb-internal-tenant-id": "tenant-a" }
      );
      saved = (await r.json()) as typeof saved;
      assert.equal(saved.entry.startsAt, workforceInstant(day + "T10:00"));
      assert.equal(saved.entry.version, 2);
      command = { operation: "delete", query: "Cliente Cero" };
      assert.equal(
        (await inbound("three", "Cancelá la reunión Cliente Cero hoy")).status,
        200
      );
      assert.equal(
        (await inbound("three", "Cancelá la reunión Cliente Cero hoy")).status,
        200
      );
      r = await call(
        "/native-calendar",
        { operation: "get", id: "wa-one" },
        { "x-herreb-internal-tenant-id": "tenant-a" }
      );
      saved = (await r.json()) as typeof saved;
      assert.equal(saved.entry.status, "CANCELLED");
      assert.equal(saved.entry.version, 3);
      assert.equal(sends, 3);
      assert.equal(
        (
          await inbound(
            "foreign",
            "¿Qué tengo en la agenda hoy?",
            "595981999999"
          )
        ).status,
        403
      );
      assert.equal(sends, 3);
    } finally {
      globalThis.fetch = original;
      db.close();
    }
  }
);
