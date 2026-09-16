import assert from "node:assert/strict";
import test from "node:test";
import {
  canRegressToDiscovery,
  markQuoteRequested,
  nextBestSalesAction,
  rememberCommercialFact,
  selectCurrentOffer,
  type CommercialState
} from "./sales-cognitive-state";

const now = "2026-09-16T12:00:00.000Z";

const baseState = (): CommercialState => ({
  tenantId: "demo-tenant",
  conversationId: "golden-001",
  stage: "DISCOVERY",
  facts: {},
  proposedLines: [],
  selectedLines: [],
  missingRequiredFields: []
});

test("EMP-001 retains confirmed event context", () => {
  let state = baseState();
  state = rememberCommercialFact(state, {
    key: "need",
    value: "event purchase",
    confirmed: true,
    source: "CUSTOMER",
    confidence: 1,
    updatedAt: now
  });
  state = rememberCommercialFact(state, {
    key: "attendees",
    value: 100,
    confirmed: true,
    source: "CUSTOMER",
    confidence: 1,
    updatedAt: now
  });
  state = rememberCommercialFact(state, {
    key: "segment",
    value: "premium",
    confirmed: true,
    source: "CUSTOMER",
    confidence: 1,
    updatedAt: now
  });

  assert.equal(state.facts.attendees?.value, 100);
  assert.equal(state.facts.segment?.value, "premium");
});

test("EMP-001 inference cannot overwrite a confirmed customer fact", () => {
  let state = rememberCommercialFact(baseState(), {
    key: "attendees",
    value: 100,
    confirmed: true,
    source: "CUSTOMER",
    confidence: 1,
    updatedAt: now
  });
  state = rememberCommercialFact(state, {
    key: "attendees",
    value: 50,
    confirmed: false,
    source: "INFERENCE",
    confidence: 0.6,
    updatedAt: now
  });

  assert.equal(state.facts.attendees?.value, 100);
});

test("EMP-001 accepts explicit customer corrections", () => {
  let state = rememberCommercialFact(baseState(), {
    key: "attendees",
    value: 100,
    confirmed: true,
    source: "CUSTOMER",
    confidence: 1,
    updatedAt: now
  });
  state = rememberCommercialFact(
    state,
    {
      key: "attendees",
      value: 120,
      confirmed: true,
      source: "CUSTOMER",
      confidence: 1,
      updatedAt: now
    },
    { explicitCustomerCorrection: true }
  );

  assert.equal(state.facts.attendees?.value, 120);
});

test("Golden Conversation 001 advances accepted complete offer to quote", () => {
  const lines = [
    { sku: "ITEM-A", name: "Product A", qty: 10 },
    { sku: "ITEM-B", name: "Product B", qty: 5 },
    { sku: "ITEM-C", name: "Product C", qty: 10 },
    { sku: "ITEM-D", name: "Product D", qty: 5 }
  ];
  let state = selectCurrentOffer(baseState(), lines);
  state = markQuoteRequested(state);

  assert.equal(state.selectedLines.length, 4);
  assert.equal(state.stage, "QUOTE_REQUESTED");
  assert.equal(nextBestSalesAction(state), "CREATE_QUOTE");
  assert.equal(canRegressToDiscovery(state), false);
});

test("Golden Conversation 001 asks one missing quote field without restarting discovery", () => {
  let state = selectCurrentOffer(baseState(), [
    { sku: "ITEM-A", name: "Product A", qty: 10 }
  ]);
  state = markQuoteRequested(state, ["customer_id"]);

  assert.equal(nextBestSalesAction(state), "ASK_ONE_DECISIVE_QUESTION");
  assert.equal(canRegressToDiscovery(state), false);
});
