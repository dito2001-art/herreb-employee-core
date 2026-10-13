# Super Admin panel — controlled-write security gate

Status: **READ_ONLY** until the following controls are implemented and verified.

## Current state
- The React admin panel (`src/workforce-admin-panel.tsx`) fetches a registry snapshot and exposes no mutation controls.
- The private admin POST API accepts a dedicated platform credential in `x-herreb-workforce-platform-token`. This is a **server-to-server secret** and must never be embedded in browser JavaScript, localStorage, HTML, or browser-accessible API responses.
- Production certification verified invalid credentials are rejected and a valid platform identity cannot persist a YELLOW operation without approval.

## Required before enabling UI writes
1. Implement a server-side, session-bound identity bridge using verified Cloudflare Access identity and an explicit server-side allowlist of platform operators. Browser requests must **not** be trusted based on user-supplied role, tenant, actor, or internal headers.
2. Resolve the actor server-side and enforce authorization for every request; deny by default. Keep platform administration distinct from tenant owner administration.
3. Require CSRF protection and origin validation for browser-initiated mutations, plus strict input validation and rate limits.
4. Never return or expose `WORKFORCE_PLATFORM_ADMIN_TOKEN` to the browser. The Worker must authenticate browser sessions separately and invoke private capabilities internally.
5. For GREEN actions: return mutation decision, persisted status, audit ID, and a fresh read-back. For YELLOW actions: require explicit approval and an operation-bound confirmation; never silently set `approveYellow=true`.
6. Enforce tenant isolation for reads as well as writes. A tenant owner must not receive the global tenant registry or another tenant's identities.
7. Add negative and positive tests for owner vs platform_admin, spoofed headers, CSRF, cross-tenant reads and writes, and audit/read-back. Require passing CI and non-production E2E before production rollout.

## Rollout order
- **Stage A:** keep read-only UI; document and verify security boundaries.
- **Stage B:** server-side operator identity and tenant-scoped read API.
- **Stage C:** controlled GREEN writes with audit/read-back.
- **Stage D:** YELLOW confirmation and safe tenant provisioning.

Do not change EMP-001, EMP-002 or EMP-003 code to implement the platform admin panel.
