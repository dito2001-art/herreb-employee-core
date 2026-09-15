import { z } from "zod";

export const KnowledgeKindSchema = z.enum([
  "CANONICAL",
  "RETRIEVED",
  "LEARNED"
]);
export type KnowledgeKind = z.infer<typeof KnowledgeKindSchema>;

export const KnowledgeRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  namespace: z.string().min(1),
  kind: KnowledgeKindSchema,
  subject: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  sourceRefs: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1).optional(),
  verified: z.boolean().default(false),
  updatedAt: z.string().min(1)
});
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;

export function assertKnowledgeTenant(
  expectedTenantId: string,
  record: KnowledgeRecord
): void {
  if (record.tenantId !== expectedTenantId) {
    throw new Error("KNOWLEDGE_TENANT_ISOLATION_VIOLATION");
  }
}

export function canUseAsVerifiedClaim(record: KnowledgeRecord): boolean {
  return record.kind === "CANONICAL" && record.verified;
}
