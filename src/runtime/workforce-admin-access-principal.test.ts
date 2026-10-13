import { strict as assert } from "node:assert";
import { test } from "node:test";
import { resolveVerifiedAccessAdminReadActor } from "./workforce-admin-access-principal";
const identities = [{ email: "owner@example.com", actorId: "owner-1", tenantId: "alpha", role: "owner" as const }];
const principal = { email: "OWNER@example.com", issuer: "https://team.cloudflareaccess.com", audience: "app-aud", expiresAt: 2000 };
const valid = () => ({ principal, identities, expectedIssuer: principal.issuer, expectedAudience: principal.audience, nowSeconds: 1000 });
test("verified principal resolves tenant owner from server-side identity map", () => {
 assert.deepEqual(resolveVerifiedAccessAdminReadActor(valid()), { actorId: "owner-1", tenantId: "alpha", role: "owner" });
});
test("unverified missing principal is denied", () => {
 assert.throws(() => resolveVerifiedAccessAdminReadActor({ ...valid(), principal: undefined }));
});
test("issuer, audience and expiry mismatch are denied", () => {
 assert.throws(() => resolveVerifiedAccessAdminReadActor({ ...valid(), expectedIssuer: "wrong" }));
 assert.throws(() => resolveVerifiedAccessAdminReadActor({ ...valid(), expectedAudience: "wrong" }));
 assert.throws(() => resolveVerifiedAccessAdminReadActor({ ...valid(), nowSeconds: 2000 }));
});
test("missing or ambiguous identity is denied", () => {
 assert.throws(() => resolveVerifiedAccessAdminReadActor({ ...valid(), identities: [] }));
 assert.throws(() => resolveVerifiedAccessAdminReadActor({ ...valid(), identities: [...identities, ...identities] }));
});
