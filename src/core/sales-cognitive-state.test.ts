import { describe, expect, it } from "vitest";
import { canRegressToDiscovery, markQuoteRequested, nextBestSalesAction, rememberCommercialFact, selectCurrentOffer, type CommercialState } from "./sales-cognitive-state";

const now = "2026-09-16T12:00:00.000Z";
const baseState = (): CommercialState => ({ tenantId: "demo-tenant", conversationId: "golden-001", stage: "DISCOVERY", facts: {}, proposedLines: [], selectedLines: [], missingRequiredFields: [] });

describe("EMP-001 cognitive commercial state", () => {
  it("retains confirmed event context", () => {
    let state = baseState();
    state = rememberCommercialFact(state, { key: "need", value: "event purchase", confirmed: true, source: "CUSTOMER", confidence: 1, updatedAt: now });
    state = rememberCommercialFact(state, { key: "attendees", value: 100, confirmed: true, source: "CUSTOMER", confidence: 1, updatedAt: now });
    state = rememberCommercialFact(state, { key: "segment", value: "premium", confirmed: true, source: "CUSTOMER", confidence: 1, updatedAt: now });
    expect(state.facts.attendees.value).toBe(100);
    expect(state.facts.segment.value).toBe("premium");
  });

  it("does not let inference overwrite a confirmed customer fact", () => {
    let state = rememberCommercialFact(baseState(), { key: "attendees", value: 100, confirmed: true, source: "CUSTOMER", confidence: 1, updatedAt: now });
    state = rememberCommercialFact(state, { key: "attendees", value: 50, confirmed: false, source: "INFERENCE", confidence: 0.6, updatedAt: now });
    expect(state.facts.attendees.value).toBe(100);
  });

  it("allows explicit customer correction", () => {
    let state = rememberCommercialFact(baseState(), { key: "attendees", value: 100, confirmed: true, source: "CUSTOMER", confidence: 1, updatedAt: now });
    state = rememberCommercialFact(state, { key: "attendees", value: 120, confirmed: true, source: "CUSTOMER", confidence: 1, updatedAt: now }, { explicitCustomerCorrection: true });
    expect(state.facts.attendees.value).toBe(120);
  });

  it("Golden Conversation 001 advances accepted complete offer to quote", () => {
    const lines = [
      { sku: "ITEM-A", name: "Product A", qty: 10 },
      { sku: "ITEM-B", name: "Product B", qty: 5 },
      { sku: "ITEM-C", name: "Product C", qty: 10 },
      { sku: "ITEM-D", name: "Product D", qty: 5 }
    ];
    let state = selectCurrentOffer(baseState(), lines);
    state = markQuoteRequested(state);
    expect(state.selectedLines).toHaveLength(4);
    expect(state.stage).toBe("QUOTE_REQUESTED");
    expect(nextBestSalesAction(state)).toBe("CREATE_QUOTE");
    expect(canRegressToDiscovery(state)).toBe(false);
  });

  it("asks only for missing quote data instead of restarting discovery", () => {
    let state = selectCurrentOffer(baseState(), [{ sku: "ITEM-A", name: "Product A", qty: 10 }]);
    state = markQuoteRequested(state, ["customer_id"]);
    expect(nextBestSalesAction(state)).toBe("ASK_ONE_DECISIVE_QUESTION");
    expect(canRegressToDiscovery(state)).toBe(false);
  });
});
