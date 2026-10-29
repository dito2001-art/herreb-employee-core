import { z } from "zod";
import { MarketingCampaignBlueprintSchema } from "./marketing-campaign-blueprint";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const BlueprintPinSchema = z.object({
  tenantId: id,
  campaignId: id,
  revision: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: id,
  correlationId: id
});
export async function hashEMP003Blueprint(raw: unknown) {
  const blueprint = MarketingCampaignBlueprintSchema.parse(raw);
  const canonical = JSON.stringify(blueprint, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        )
      : value
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
    )
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
