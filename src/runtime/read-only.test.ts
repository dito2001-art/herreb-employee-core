import assert from "node:assert/strict";
import test from "node:test";
import type { CapabilityAdapter } from "../core";
import { projectReadOnlyAdapter } from "../adapters";
import { assertReadOnlyAdapters, readOnlyCapabilityIds } from "./read-only";

const mixed: CapabilityAdapter = {
  id: "mixed",
  employees: ["EMP-002"],
  capabilities: ["calendar.read", "calendar.write"],
  async execute() {
    return { ok: true };
  }
};

test("mixed read/write adapter is rejected by read-only runtime", () => {
  assert.throws(() => assertReadOnlyAdapters([mixed]), /calendar.write/);
});

test("projection exposes only selected read capability", async () => {
  const projected = projectReadOnlyAdapter(mixed, ["calendar.read"]);
  assert.deepEqual(projected.capabilities, ["calendar.read"]);
  assert.doesNotThrow(() => assertReadOnlyAdapters([projected]));
  assert.deepEqual([...readOnlyCapabilityIds([projected])], ["calendar.read"]);

  const blocked = await projected.execute({
    context: {
      tenantId: "herreb",
      employeeId: "EMP-002",
      workspaceId: "test",
      actorId: "fernando",
      channel: "test",
      correlationId: "corr"
    },
    capabilityId: "calendar.write",
    input: { operation: "delete", eventId: "x" }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error?.code, "READ_ONLY_CAPABILITY_BLOCKED");
});
