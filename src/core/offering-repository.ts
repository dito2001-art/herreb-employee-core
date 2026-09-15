import { OfferingSchema, type Offering } from "./contracts";

export interface TenantOfferingRepository {
  list(tenantId: string, activeOnly?: boolean): Promise<Offering[]>;
  get(tenantId: string, id: string): Promise<Offering | undefined>;
  put(tenantId: string, offering: Offering): Promise<Offering>;
}

export function assertOfferingTenant(tenantId: string, offering: Offering): void {
  if (offering.tenantId !== tenantId) {
    throw new Error("OFFERING_TENANT_ISOLATION_VIOLATION");
  }
}

export function createInMemoryTenantOfferingRepository(): TenantOfferingRepository {
  const offerings = new Map<string, Offering>();
  const key = (tenantId: string, id: string) => `${tenantId}:${id}`;

  return {
    async list(tenantId, activeOnly = false) {
      return [...offerings.values()].filter(
        (offering) =>
          offering.tenantId === tenantId && (!activeOnly || offering.active)
      );
    },
    async get(tenantId, id) {
      return offerings.get(key(tenantId, id));
    },
    async put(tenantId, input) {
      const offering = OfferingSchema.parse(input);
      assertOfferingTenant(tenantId, offering);
      offerings.set(key(tenantId, offering.id), offering);
      return offering;
    }
  };
}
