/** Reject legacy unconditional M2M draft writes; exactly one revision mode is required. */
export function parseEMP003M2MDraftRevision(input: unknown): { createOnly: true; expectedRevision?: never } | { createOnly?: never; expectedRevision: number } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  const createOnly = body.createOnly === true;
  const expectedRevision = body.expectedRevision;
  const validRevision = typeof expectedRevision === 'number' && Number.isSafeInteger(expectedRevision) && expectedRevision >= 1;
  if (createOnly && expectedRevision === undefined) return { createOnly: true };
  if (body.createOnly === undefined && validRevision) return { expectedRevision: expectedRevision as number };
  return null;
}

/** Explicit M2M tenant boundary; reject missing, malformed and cross-tenant blueprints before DO forwarding. */
export function isEMP003M2MBlueprintTenant(input: unknown, tenantId: string): boolean {
  return Boolean(input && typeof input === 'object' && !Array.isArray(input) &&
    (input as Record<string, unknown>).tenantId === tenantId);
}
