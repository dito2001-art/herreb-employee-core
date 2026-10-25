# WF-01 P0: EMP-003 staging access gate — security change proposal (not executable)

Candidate audited: PR #287 SHA `b6f2034b1322724c43bcce4ec40e4a460920fe53`. No production changes authorized.

## Source findings
- `src/worker.ts:37-39`: `/api/emp003/operations` delegates to browser handler; `src/runtime/emp003-browser-operations.ts:12-35` verifies Access JWT and server-derived tenant.
- `src/worker.ts:40-254`: nine `/api/internal/emp003/*` endpoints use M2M token and server tenant scope, not Access JWT. They must be unreachable from public hostname; do not replace M2M with Access for internal callers without interface review.
- `src/worker.ts:319`: fallback to `employeeServer.fetch`.
- `src/server.ts:200-235`: `/agents/*` trusts `ctx.access.getIdentity()` OR a raw `cf-access-authenticated-user-email` header when hostname is `employee.herreb.com`; this is not cryptographic JWT validation. It does not establish a staging identity for a new hostname.
- `src/server.ts:238-242`: `routeAgentRequest` fallback after `authenticatedAgentRequest` returns undefined; unknown /agents route handling must be tested for fail-closed.
- Assets and preview endpoints: protection not established by the source files inspected.

## Required minimum patch before staging deployment
1. Add a staging-specific entrypoint or staging-only gate (do NOT modify shared HerreB Owner policy) which **fails closed** for all requests unless a JWT from the EMP-003 Access application is cryptographically validated against a dedicated issuer and audience. Reuse `verifyWorkforceAccessJwt` with JWKS fetched from the fixed configured Cloudflare team, not a token-provided URL. No reliance on `cf-access-authenticated-user-email` as sole proof.
2. For interactive `/agents/*` and `/api/emp003/*`, derive actor and tenant from the verified identity mapping, not request headers or query/body; reject missing identity map, unknown role, wrong tenant. Verify WebSocket Upgrade before accepting handshake.
3. Return 404/403 for `/api/internal/emp003/*` at the **public staging ingress**; retain existing M2M authorization for explicitly approved private service ingress only, or remove private ingress entirely if not needed.
4. Disable alternative public entrypoints (workers.dev, preview aliases, routes, custom domains, deploy hooks) or protect each with the same gate. Protect static assets containing sensitive data. No fallback to production config, tokens, Access audience or tenant mapping.
5. Tests: anonymous, forged email header, expired/invalid JWT, cross-app audience, tenant A/B, /agents WebSocket, internal M2M over public ingress, asset/preview direct URL, config missing, JWKS failure. Every deny must fail closed.

## Gate separation
PRE-DEPLOY: independent WF-04 code review and tests for staging-only gate, inventory of ingress and Access policies, no routes/publication bypass, isolated identity mapping and bindings. POST-DEPLOY only after dual GO: real E2E JWT/A-B/preview/WS/readback. Never claim runtime PASS from this proposal.

STATUS: PREPARED / CODE NOT IMPLEMENTED / SECURITY NO-GO. No deploy, merge, migrations, secrets or shared Access policy changes.
