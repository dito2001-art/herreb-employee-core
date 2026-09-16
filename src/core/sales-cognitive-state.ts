import { z } from "zod";

/**
 * EMP-001 cognitive commercial state.
 *
 * This is memory for the model, not a rigid conversation script. The model may
 * reason freely, but confirmed facts are monotonic unless the customer
 * explicitly changes them. Authoritative commercial facts (catalog, price,
 * stock, discounts, delivery and payment status) must still come from tools.
 */
export const CommercialStageSchema = z.enum([
  "DISCOVERY",
  "SOLUTION_BUILDING",
  "PROPOSAL_PRESENTED",
  "OFFER_SELECTED",
  "QUOTE_REQUESTED",
  "QUOTE_CREATED",
  "ORDER_REQUESTED",
  "ORDER_CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "DECLINED",
  "CANCELLED",
  "HUMAN_HANDOFF"
]);
export type CommercialStage = z.infer<typeof CommercialStageSchema>;

export const CommercialLineSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  currency: z.string().min(1).optional()
});
export type CommercialLine = z.infer<typeof CommercialLineSchema>;

export const CommercialFactSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  confirmed: z.boolean().default(true),
  source: z.enum(["CUSTOMER", "TOOL", "TENANT_RULE", "INFERENCE"]),
  confidence: z.number().min(0).max(1).default(1),
  updatedAt: z.string().min(1)
});
export type CommercialFact = z.infer<typeof CommercialFactSchema>;

export const CommercialStateSchema = z.object({
  tenantId: z.string().min(1),
  conversationId: z.string().min(1),
  customerId: z.string().min(1).optional(),
  stage: CommercialStageSchema.default("DISCOVERY"),
  facts: z.record(z.string(), CommercialFactSchema).default({}),
  proposedLines: z.array(CommercialLineSchema).default([]),
  selectedLines: z.array(CommercialLineSchema).default([]),
  quoteId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  lastCustomerIntent: z.string().min(1).optional(),
  missingRequiredFields: z.array(z.string().min(1)).default([])
});
export type CommercialState = z.infer<typeof CommercialStateSchema>;

export type NextBestAction =
  | "UNDERSTAND_NEED"
  | "BUILD_SOLUTION"
  | "PRESENT_PROPOSAL"
  | "ASK_ONE_DECISIVE_QUESTION"
  | "CREATE_QUOTE"
  | "CREATE_ORDER"
  | "REQUEST_PAYMENT"
  | "VERIFY_PAYMENT"
  | "RESPOND_CONTEXTUALLY"
  | "STOP";

const TERMINAL = new Set<CommercialStage>([
  "PAID",
  "DECLINED",
  "CANCELLED",
  "HUMAN_HANDOFF"
]);

export function rememberCommercialFact(
  state: CommercialState,
  fact: CommercialFact,
  options: { explicitCustomerCorrection?: boolean } = {}
): CommercialState {
  const parsed = CommercialStateSchema.parse(state);
  const nextFact = CommercialFactSchema.parse(fact);
  const previous = parsed.facts[nextFact.key];

  // Confirmed facts never disappear or silently change because of inference.
  if (
    previous?.confirmed &&
    nextFact.source === "INFERENCE" &&
    JSON.stringify(previous.value) !== JSON.stringify(nextFact.value)
  ) {
    return parsed;
  }

  // A customer may explicitly change a previously confirmed requirement.
  if (
    previous?.confirmed &&
    nextFact.source === "CUSTOMER" &&
    JSON.stringify(previous.value) !== JSON.stringify(nextFact.value) &&
    !options.explicitCustomerCorrection
  ) {
    return parsed;
  }

  return CommercialStateSchema.parse({
    ...parsed,
    facts: { ...parsed.facts, [nextFact.key]: nextFact }
  });
}

export function selectCurrentOffer(
  state: CommercialState,
  lines: CommercialLine[]
): CommercialState {
  const parsed = CommercialStateSchema.parse(state);
  const selectedLines = z.array(CommercialLineSchema).min(1).parse(lines);
  return CommercialStateSchema.parse({
    ...parsed,
    selectedLines,
    stage: "OFFER_SELECTED"
  });
}

export function markQuoteRequested(
  state: CommercialState,
  missingRequiredFields: string[] = []
): CommercialState {
  const parsed = CommercialStateSchema.parse(state);
  return CommercialStateSchema.parse({
    ...parsed,
    stage: "QUOTE_REQUESTED",
    lastCustomerIntent: "QUOTE_REQUESTED",
    missingRequiredFields
  });
}

export function nextBestSalesAction(state: CommercialState): NextBestAction {
  const parsed = CommercialStateSchema.parse(state);
  if (TERMINAL.has(parsed.stage)) return "STOP";

  if (parsed.stage === "QUOTE_REQUESTED") {
    if (parsed.selectedLines.length === 0) return "RESPOND_CONTEXTUALLY";
    return parsed.missingRequiredFields.length > 0
      ? "ASK_ONE_DECISIVE_QUESTION"
      : "CREATE_QUOTE";
  }
  if (parsed.stage === "QUOTE_CREATED") return "RESPOND_CONTEXTUALLY";
  if (parsed.stage === "ORDER_REQUESTED") return "CREATE_ORDER";
  if (parsed.stage === "ORDER_CREATED") return "REQUEST_PAYMENT";
  if (parsed.stage === "PAYMENT_PENDING") return "VERIFY_PAYMENT";
  if (parsed.stage === "OFFER_SELECTED") return "RESPOND_CONTEXTUALLY";
  if (parsed.stage === "PROPOSAL_PRESENTED") return "RESPOND_CONTEXTUALLY";
  if (parsed.stage === "SOLUTION_BUILDING") return "PRESENT_PROPOSAL";
  return "UNDERSTAND_NEED";
}

/**
 * Prevent accidental funnel regression after a strong buying signal.
 * Explicit customer changes are handled by updating facts/offer first; they do
 * not justify forgetting the accepted offer or restarting discovery.
 */
export function canRegressToDiscovery(state: CommercialState): boolean {
  const parsed = CommercialStateSchema.parse(state);
  return parsed.stage === "DISCOVERY" || parsed.stage === "SOLUTION_BUILDING";
}
