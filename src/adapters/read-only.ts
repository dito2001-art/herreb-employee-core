import type { CapabilityAdapter } from "../core";

export function projectReadOnlyAdapter(
  adapter: CapabilityAdapter,
  allowedCapabilities: readonly string[]
): CapabilityAdapter {
  const allowed = new Set(allowedCapabilities);
  const capabilities = adapter.capabilities.filter((id) => allowed.has(id));
  if (capabilities.length === 0) {
    throw new Error(`READ_ONLY_PROJECTION_EMPTY:${adapter.id}`);
  }

  return {
    ...adapter,
    id: `${adapter.id}:read-only`,
    capabilities,
    async execute(request) {
      if (!capabilities.includes(request.capabilityId)) {
        return {
          ok: false,
          error: {
            code: "READ_ONLY_CAPABILITY_BLOCKED",
            message: `${request.capabilityId} is not exposed by the read-only projection`
          },
          evidence: { executed: false, adapterId: adapter.id }
        };
      }
      return adapter.execute(request);
    }
  };
}
