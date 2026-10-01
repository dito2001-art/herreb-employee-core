import type { CapabilityAdapter } from "../core";

const READ_ONLY_CAPABILITIES = new Set([
  "crm.read",
  "offering.read",
  "offering.recommend",
  "calendar.read",
  "email.read",
  "marketing.read",
  "research.web"
]);

export function isReadOnlyCapability(capabilityId: string): boolean {
  return READ_ONLY_CAPABILITIES.has(capabilityId);
}

export function readOnlyCapabilityIds(
  adapters: readonly CapabilityAdapter[]
): Set<string> {
  const ids = new Set<string>();
  for (const adapter of adapters) {
    for (const capabilityId of adapter.capabilities) {
      if (READ_ONLY_CAPABILITIES.has(capabilityId)) ids.add(capabilityId);
    }
  }
  return ids;
}

export function assertReadOnlyAdapters(
  adapters: readonly CapabilityAdapter[]
): void {
  for (const adapter of adapters) {
    const unsafe = adapter.capabilities.filter(
      (id) => !READ_ONLY_CAPABILITIES.has(id)
    );
    if (unsafe.length > 0) {
      throw new Error(
        `READ_ONLY_RUNTIME_REJECTED_ADAPTER:${adapter.id}:${unsafe.join(",")}`
      );
    }
  }
}
