import assert from "node:assert/strict";
import test from "node:test";
import {
  ProactiveSalesPolicySchema,
  canAutonomouslyContactLead,
  type SalesLead
} from "./proactive-sales";

const lead: SalesLead = {
  id: "lead-1",
  tenantId: "herreb-client-0",
  source: "DATABASE",
  contactKey: "lead@example.com"
};

const policy = () =>
  ProactiveSalesPolicySchema.parse({
    tenantId: "herreb-client-0",
    channels: ["WHATSAPP", "EMAIL", "CRM"]
  });

test("EMP001 proactive sales is ACTIVE and autonomous by default", () => {
  const parsed = policy();
  assert.equal(parsed.mode, "ACTIVE");
  assert.equal(parsed.allowLeadDiscovery, true);
  assert.equal(parsed.allowDatabaseSelling, true);
  assert.equal(parsed.allowAutonomousOutreach, true);
  assert.equal(parsed.allowAutonomousFollowup, true);
  assert.equal(
    canAutonomouslyContactLead({
      policy: parsed,
      tenantId: "herreb-client-0",
      lead,
      channel: "EMAIL",
      kind: "OUTREACH"
    }).allowed,
    true
  );
});

test("explicit PAUSED state stops proactive contact", () => {
  const parsed = { ...policy(), mode: "PAUSED" as const };
  const decision = canAutonomouslyContactLead({
    policy: parsed,
    tenantId: "herreb-client-0",
    lead,
    channel: "WHATSAPP",
    kind: "FOLLOWUP"
  });
  assert.deepEqual(decision, { allowed: false, reason: "SALES_PAUSED" });
});

test("opt-out and suppression fail closed", () => {
  const parsed = policy();
  assert.equal(
    canAutonomouslyContactLead({
      policy: parsed,
      tenantId: "herreb-client-0",
      lead: { ...lead, optedOut: true },
      channel: "EMAIL",
      kind: "OUTREACH"
    }).reason,
    "LEAD_OPTED_OUT"
  );
  assert.equal(
    canAutonomouslyContactLead({
      policy: { ...parsed, suppressionList: [lead.contactKey] },
      tenantId: "herreb-client-0",
      lead,
      channel: "EMAIL",
      kind: "OUTREACH"
    }).reason,
    "LEAD_SUPPRESSED"
  );
});

test("cross-tenant sales contact fails closed", () => {
  const decision = canAutonomouslyContactLead({
    policy: policy(),
    tenantId: "tenant-b",
    lead,
    channel: "EMAIL",
    kind: "OUTREACH"
  });
  assert.deepEqual(decision, {
    allowed: false,
    reason: "TENANT_MISMATCH"
  });
});
