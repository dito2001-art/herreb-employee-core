/** Platform authority is independent of tenant identity and caller-provided role headers. */
export interface PlatformAdminCredentialInput {
  expectedToken?: string;
  suppliedToken?: string | null;
  actorId?: string;
}
function constantTimeTokenEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}
export function resolvePlatformAdminCredential(input: PlatformAdminCredentialInput):
  | { actorId: string; tenantId: "platform"; role: "platform_admin" }
  | undefined {
  const expected = input.expectedToken?.trim();
  const supplied = input.suppliedToken?.trim();
  const actorId = input.actorId?.trim();
  if (!expected || !supplied || !actorId || expected.length < 32) return undefined;
  if (!constantTimeTokenEqual(expected, supplied)) return undefined;
  return { actorId, tenantId: "platform", role: "platform_admin" };
}
