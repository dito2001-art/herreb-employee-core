import assert from "node:assert/strict";
import test from "node:test";
import { StaticModelRouter } from "../core";
import { HerreBEmployeeRuntime } from "../runtime";
import { buildEmployeeTools, listManifestToolIds } from "./tools";

const router = new StaticModelRouter({
  provider: "workers-ai",
  model: "test-model",
  reason: "test"
});

async function session(employeeId: "EMP-001" | "EMP-002" | "EMP-003") {
  return new HerreBEmployeeRuntime({ modelRouter: router }).start({
    tenantId: "herreb",
    employeeId,
    workspaceId: "test",
    actorId: "fernando",
    channel: "test"
  });
}

test("EMP-001 receives sales tools but not assistant or marketer tools", async () => {
  const current = await session("EMP-001");
  const ids = listManifestToolIds(current.manifest);
  assert.ok(ids.includes("offering.read"));
  assert.ok(ids.includes("quote.create"));
  assert.ok(!ids.includes("email.send"));
  assert.ok(!ids.includes("content.create"));
});

test("EMP-002 receives assistant tools but not sales or marketer tools", async () => {
  const current = await session("EMP-002");
  const ids = listManifestToolIds(current.manifest);
  assert.ok(ids.includes("calendar.read"));
  assert.ok(ids.includes("email.send"));
  assert.ok(!ids.includes("quote.create"));
  assert.ok(!ids.includes("campaign.schedule"));
});

test("EMP-003 receives marketer tools but not sales or assistant tools", async () => {
  const current = await session("EMP-003");
  const ids = listManifestToolIds(current.manifest);
  assert.ok(ids.includes("research.web"));
  assert.ok(ids.includes("content.create"));
  assert.ok(!ids.includes("quote.create"));
  assert.ok(!ids.includes("calendar.write"));
});

test("unconnected manifest tool returns evidence and performs no side effect", async () => {
  const current = await session("EMP-002");
  const tools = buildEmployeeTools(current) as Record<string, { execute?: Function }>;
  const execute = tools["email.send"]?.execute;
  assert.equal(typeof execute, "function");
  const result = await execute?.({ input: { to: "nobody@example.test" } }, {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CAPABILITY_NOT_CONNECTED");
  assert.equal(result.evidence.executed, false);
  assert.equal(result.evidence.tenantId, "herreb");
});
