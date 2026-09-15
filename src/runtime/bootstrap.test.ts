import assert from "node:assert/strict";
import test from "node:test";
import type { ServiceFetcher } from "../adapters";
import { buildReadOnlyRuntimeAdapters } from "./bootstrap";
import { readOnlyCapabilityIds } from "./read-only";

const service: ServiceFetcher = {
  async fetch() {
    return Response.json({ ok: true });
  }
};

test("bootstrap exposes nothing when bindings or tokens are incomplete", () => {
  assert.deepEqual(buildReadOnlyRuntimeAdapters({}), []);
  assert.deepEqual(buildReadOnlyRuntimeAdapters({ salesOps: service }), []);
  assert.deepEqual(buildReadOnlyRuntimeAdapters({ salesOpsToken: "token" }), []);
  assert.deepEqual(buildReadOnlyRuntimeAdapters({ crmRead: service }), []);
});

test("bootstrap exposes only explicitly projected read-only capabilities", () => {
  const adapters = buildReadOnlyRuntimeAdapters({
    salesOps: service,
    salesOpsToken: "sales-token",
    crmRead: service,
    crmReadToken: "crm-token",
    calendarRead: service,
    calendarReadToken: "calendar-token",
    emailRead: service,
    emailReadToken: "email-token"
  });
  assert.deepEqual([...readOnlyCapabilityIds(adapters)].sort(), [
    "calendar.read",
    "crm.read",
    "email.read",
    "offering.read",
    "offering.recommend"
  ]);
  assert.ok(
    adapters.every((adapter) =>
      adapter.capabilities.every((id) => id.endsWith(".read") || id === "offering.recommend")
    )
  );
});
