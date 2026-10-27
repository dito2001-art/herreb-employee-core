# EMP-003 staging browser write BFF — SECURITY NO-GO (design-only)

Status: PREPARED, not implemented or tested. No browser write routes should be enabled by this document.

## Explicit contract for independent WF-01 / WF-04 review

1. Permit only POST /api/emp003/drafts from a verified Cloudflare Access JWT, dedicated staging issuer and audience, server-side identity map. Reject missing/expired/invalid signature, issuer, audience, unregistered identities, and all spoofed headers.
2. Resolve tenantId and actorId only from the verified principal. Never trust tenantId, actorId, actorRole or target DO id from browser JSON/query/headers. Owner role required for draft mutation.
3. Parse a bounded JSON body, allow only campaignId and blueprint fields, validate schema and ownership, and enforce blueprint.tenantId === server-derived tenantId; reject cross-tenant references.
4. Route directly to EMP003_CAMPAIGN_STATE.get(idFromName(tenantId)).fetch('/draft'), not through /api/internal/emp003/drafts or a browser-supplied M2M token. Never forward inbound Authorization, cookies, cf-access headers or M2M headers to the DO.
5. Verify persistence with a fresh GET read-back, including campaignId, tenantId, version/revision and stored blueprint. Fail closed if read-back mismatches or fails. Approved drafts must be immutable server-side; prevent replay and concurrent stale revisions.
6. Fail closed on missing DO binding, missing Access config, JWKS unavailable, malformed JSON, oversized payload, invalid scope, missing record, conflicting version or storage failure. Cache-Control: no-store.
7. No publication, review transition, approval, external campaign or WebSocket route is part of this BFF.
8. Test two tenants A/B (read and write), signature/issuer/audience/expiry, malicious tenant overrides, approval immutability, duplicate writes, stale revisions, read-back failure and error paths with real staging Access before GO.

## Dependencies to resolve before implementation

- Verify actual DO /draft request and response contract, revision semantics, approved-state enforcement and GET read-back endpoint.
- Verify actual editor client save contract; do not assume existing M2M-only API is safe for browser use.
- Independently review staging binding isolation, Access policy, assets behavior and rollback.

Release gate: WF-01 SECURITY GO + WF-04 certification GO on exact SHA, CI PASS, isolated staging E2E and rollback. No merge or deploy authorized.
