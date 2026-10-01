export type IdentityAssurance =
  | "UNVERIFIED"
  | "SERVICE_VERIFIED"
  | "OWNER_VERIFIED";

export interface RuntimeProvenance {
  assurance: IdentityAssurance;
  subjectId?: string;
  tenantId?: string;
  source: string;
}

export function unverifiedProvenance(
  source = "session-state"
): RuntimeProvenance {
  return { assurance: "UNVERIFIED", source };
}

export function canAuthorizeControlledWrite(
  provenance: RuntimeProvenance,
  expectedTenantId: string,
  expectedActorId: string
): boolean {
  return (
    provenance.assurance === "OWNER_VERIFIED" &&
    provenance.tenantId === expectedTenantId &&
    provenance.subjectId === expectedActorId
  );
}
