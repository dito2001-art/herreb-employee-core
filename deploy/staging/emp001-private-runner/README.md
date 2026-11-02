# EMP-001 private runner candidate

Review-only candidate stacked in Core PR #334 on top of PR #330 HEAD `4f20f415b14911be95d02ccfe44b6b5e231c955b`. The exact consolidated bundle HEAD is recorded in PR #334. The candidate's CI proves its offline contract only; it does not certify live Access, Cloudflare resources, or deployment.

The runner allows POST /internal/emp001/chat only. Its input accepts a message and optional session_id. Access JWT is verified cryptographically with an explicitly configured RS256 public JWKS, issuer, audience and validity times. A server-controlled principal map resolves exact subject and email to one role, tenant and A/B slot. Runtime Service Bindings and bearer tokens are separate per slot.

The caller cannot provide tenant_id, channel, customer_id, operation_id or arbitrary privileged fields. The runtime and Sales Ops still must independently authenticate their own callers. Access identity does not automatically propagate across Service Bindings.

The Wrangler manifest disables the runner by default and declares no public route, workers.dev, preview URL or cron. The manifest is not an authorized deployment. No actual Access app, principals, secrets, D1, DO, R2 or Runtime A/B services are provisioned by this branch.

This is a restricted chat ingress, not a direct order-concurrency harness. It does not certify create_order CAS, independent GET, or Sales Ops persistence. WF-01 must independently approve JWT trust and key rotation, principal mapping, ingress and per-hop credentials. WF-04 must approve the final SHA, configuration, isolation and rollback. Until then SECURITY/RELEASE NO-GO.

## Evidence-driven GO closure (review-only, no infrastructure changes)

This section is the executable acceptance contract for WF-01 and WF-04. It does not authorize deployment or access changes. The reviewed candidate must be identified by exact HEAD SHA; local tests are not a substitute for actual Access/tenant isolation.

### WF-01 SECURITY GO evidence

1. **Access trust and key rotation:** identify the intended Access application/team issuer and application AUD from authoritative Cloudflare configuration, without publishing credentials. Verify the signing-key source (team certs/JWKS), key ID matching, rotation and refresh ownership, and fail-closed behavior on missing/expired/untrusted keys. A static `ACCESS_JWKS_JSON` is only acceptable if an independently approved, operationally enforceable rotation procedure exists. Do not copy JWTs or keys into issues.
2. **Principal A/B isolation:** provide redacted evidence that each Access subject/email resolves to one authorized slot and one distinct tenant. Confirm identity B is not granted via shared Owner policy. Prove that both tenant mappings, runtime bearer tokens and Service Binding destinations are distinct. The code rejects equal token strings and the same binding object; this does **not** prove distinct actual Cloudflare services.
3. **Private ingress:** confirm the intended invoker and how its authenticated Access JWT is passed to the runner over a private Service Binding. `workers_dev=false`, `preview_urls=false`, `routes=[]`, `crons=[]` and disabled-by-default must remain true in the reviewed manifest. No public hostname, preview URL, route, cron, or implicit gateway authorization.
4. **Per-hop authorization:** independently verify Runtime A/B authenticate their inbound bearer and authorize the supplied tenant; verify Sales Ops authorizes tenant and operation IDs server-side. A successful runner unit test is not proof of these downstream controls.
5. **Decision:** record an explicit `SECURITY GO` or `SECURITY NO-GO` with exact SHA, redacted Cloudflare resource identifiers, evidence links and residual risk in PR #331.

### WF-04 RELEASE GO evidence

1. **Resource inventory by tenant:** produce a redacted, authoritative mapping of planned and existing Worker A/B names, Service Bindings, D1/DO/KV/R2 resources, migrations, access policies and environment. Mark each item `exists and verified`, `missing`, or `not applicable`; do not infer existence from Wrangler names.
2. **Composition and compatibility:** identify exact Core, EMP-001 Runtime, Sales Ops, EMP-002 and EMP-003 candidate SHAs and whether the private runner's `POST /chat` contract is compatible with the real runtime. Track order CAS, independent GET and concurrency certification separately.
3. **Safe release plan:** define preflight evidence, configuration changes requiring owner authorization, isolation test plan (A->A, B->B, cross-tenant negative cases), expected HTTP results, rollback owner and rollback sequence. No test against live services until dual GO and explicit authorization.
4. **Decision:** record explicit `RELEASE GO` or `RELEASE NO-GO` against the same exact SHA, with links to evidence and open dependencies.

### Gate and authorization boundary

- `LOCAL TEST GO`: signed JWT unit tests passed locally; does not certify real Cloudflare.
- `SECURITY GO`: requires WF-01 independent acceptance and evidence above.
- `RELEASE GO`: requires WF-04 independent acceptance and evidence above.
- `OWNER AUTHORIZATION`: separately required before provisioning, secrets, migrations, deployment, remote E2E or production changes, even if both reviews are GO.
- Missing evidence is `NO-GO`, never inferred approval. Do not repeat CI or mocks without code changes. Keep PR #329 and #330 unchanged.


## Current Cloudflare read-back (2026-11-01)

The authenticated dashboard read-back found that the actual B downstream Workers are not private at the network edge:
- `herreb-emp001-runtime-stg-b.dito2001.workers.dev` has the public Worker URL enabled ("Anyone with this URL can visit"); the UI offers "Enable Access".
- `herreb-emp001-sales-ops-stg-b.dito2001.workers.dev` has the same setting.
- Preview URL checkboxes were off and no custom domains/routes were listed.
- Sales Ops B has its own D1 database `herreb-emp001-sales-ops-staging-b-db` (UUID `8530770d-bb37-486a-860b-3cda518c864e`) and tenant API/Sales Ops secrets configured.

These are P0 blockers for private-ingress acceptance. Application-level bearer checks may still reject unauthorized operations, but they do not satisfy the required Access/private ingress boundary. Do not enable the runner or perform remote A/B E2E until workers.dev is disabled or Access is applied and verified on both B Workers. This finding is not a claim of successful unauthorized data access.

The runner manifest is disabled by default and binds to the Runtime A/B service names only. It does not itself bind Sales Ops; Sales Ops access remains a downstream Runtime responsibility and must be independently verified. No Cloudflare configuration was changed.


## Current release-gate delta (2026-11-02; read-only)

- PR #334 consolidates the exact PR #330 base plus the EMP-003 staging-copy, Sales Ops B credential, and private-runner candidates. Its four exact-HEAD CI workflows passed. PR #334 remains Draft; no independent WF-01/WF-04 review exists.
- The Cloudflare Access Applications inventory currently shows only four apps: EMP003 Staging, Workforce Staging Gateway, Employee Core, and Workforce Admin. The gateway app is associated with the shared `HerreB Owner` policy. This does not establish a dedicated EMP-001 test-operator identity/policy. Do not reuse EMP-003's app or the shared Owner policy as a substitute.
- The integrated Worker manifest is explicitly for a NEW isolated Worker and NEW DO namespaces. It has no public routes, workers.dev, preview URLs, or cron. It requires independently configured `STAGING_ACCESS_TEAM_DOMAIN`, `STAGING_ACCESS_AUDIENCE`, `STAGING_IDENTITY_MAP_JSON`, and `STAGING_DO_BOUNDARY_KEY` (minimum 32 bytes); none is provisioned by the PR. Its Access identity map must resolve the exact authenticated A/B actors to authorized tenant roles.
- Runtime B's current Settings page confirms encrypted secret names and distinct B Service Bindings/SQLite DO. Secret values remain unreadable. The prior Domains read-back still showed public workers.dev access for Runtime B and Sales Ops B; no newer Domains read-back has been captured.
- Runtime A staging service `herreb-emp001-runtime-stg-a` was previously checked using Wrangler and returned Cloudflare error 10007 (Worker does not exist). Do not substitute the production Runtime A service.
- The runner requires distinct A/B Runtime Service Bindings and bearer tokens. It is disabled by default and has no public route. The runner's private caller path must be documented and independently authenticated; an Access app on the runner itself is not implied by a private Service Binding. The ingress Access policy must protect the actual user-facing caller/gateway.
- EMP-002 remains G0 (native calendar operations only; no Meta/cron/internal delivery). EMP-003 fallback storage is restricted to text/plain <=64 KiB; it is not general binary asset storage and does not replace R2.

**Operational status: NO-GO.** Required before SECURITY/RELEASE GO: provision/verify the new isolated staging Worker and DO namespaces; configure its dedicated Access trust/identity map and boundary key securely; provision isolated Runtime A (never production); close direct public ingress on Runtime B and Sales Ops B; prove distinct A/B effective tenant/token values; run exact, approved live preflight and A/B negative tests; then obtain independent WF-01 SECURITY and WF-04 RELEASE approvals on one exact SHA/config digest. Owner authorization remains separately required for any migration, secret mutation, deployment or production change.
