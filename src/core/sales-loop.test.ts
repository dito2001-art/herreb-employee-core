import assert from "node:assert/strict";
import test from "node:test";
import { ProactiveSalesPolicySchema } from "./proactive-sales";
import { nextSalesLoopAction, type SalesLoopLead } from "./sales-loop";

const tenantId = "herreb-client-0";
const policy = () =>
  ProactiveSalesPolicySchema.parse({
    tenantId,
    channels: ["EMAIL", "WHATSAPP", "CRM"],
  });

const qualifiedLead = (
  overrides: Partial<SalesLoopLead> = {},
): SalesLoopLead => ({
  id: "lead-1",
  tenantId,
  source: "DATABASE",
  contactKey: "lead@example.com",
  qualified: true,
  ...overrides,
});

test("empty active pipeline asks for database leads first", () => {
  assert.deepEqual(
    nextSalesLoopAction({ tenantId, policy: policy(), leads: [] }),
    {
      action: "IMPORT_DATABASE",
      reason: "DATABASE_SELLING_ENABLED",
    },
  );
});

test("unqualified lead is qualified before contact", () => {
  const lead = qualifiedLead({ qualified: false });
  assert.equal(
    nextSalesLoopAction({ tenantId, policy: policy(), leads: [lead] }).action,
    "QUALIFY",
  );
});

test("qualified untouched lead receives autonomous outreach", () => {
  const decision = nextSalesLoopAction({
    tenantId,
    policy: policy(),
    leads: [qualifiedLead()],
  });
  assert.equal(decision.action, "OUTREACH");
  assert.equal(decision.channel, "EMAIL");
});

test("contacted lead receives followup only when due", () => {
  const due = qualifiedLead({ contacted: true, followupDue: true });
  assert.equal(
    nextSalesLoopAction({ tenantId, policy: policy(), leads: [due] }).action,
    "FOLLOWUP",
  );

  const notDue = qualifiedLead({ contacted: true, followupDue: false });
  assert.notEqual(
    nextSalesLoopAction({ tenantId, policy: policy(), leads: [notDue] }).action,
    "FOLLOWUP",
  );
});

test("touch limits prevent repeated contact", () => {
  const lead = qualifiedLead({ touchesToday: 1, touchesThisWeek: 1 });
  assert.notEqual(
    nextSalesLoopAction({ tenantId, policy: policy(), leads: [lead] }).action,
    "OUTREACH",
  );
});

test("opt-out is suppressed before any selling action", () => {
  const lead = qualifiedLead({ optedOut: true });
  assert.deepEqual(
    nextSalesLoopAction({ tenantId, policy: policy(), leads: [lead] }),
    {
      action: "SUPPRESS",
      leadId: "lead-1",
      reason: "LEAD_OPTED_OUT",
    },
  );
});

test("PAUSED stops the loop and tenant mismatch fails closed", () => {
  assert.equal(
    nextSalesLoopAction({
      tenantId,
      policy: { ...policy(), mode: "PAUSED" },
      leads: [qualifiedLead()],
    }).reason,
    "SALES_PAUSED",
  );
  assert.equal(
    nextSalesLoopAction({
      tenantId: "tenant-b",
      policy: policy(),
      leads: [qualifiedLead()],
    }).reason,
    "TENANT_MISMATCH",
  );
});
