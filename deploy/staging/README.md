# WF-01 / EMP-003 staging — PREPARED, NOT APPROVED

This change **does not deploy or migrate anything**. It does not modify the existing Cloudflare Hello World gateway, production wrangler.jsonc, credentials, DNS or Access policy. The delivery candidate extends validation-only CI; it does not add a publication workflow.

## Verified starting point

Owner evidence 2026-10-25: `herreb-workforce-staging-gateway` version `8df0e463`, manually deployed, no bindings, Hello World. It is **not** a Workforce app or a usable EMP-003 staging gateway.

Existing inventory (Issue #281): isolated D1 `488f4829-bee4-4e0a-8ecd-bd4a1ced71b4`, KV `0c24a032442d47adb30dfc8dbf72b010`, Queue `b9e10406c5b147aa81bff86818138bcf`. Existing staging gateway has a Cloudflare Access login observation, **not** a proven authenticated and denied A/B test.

## Minimum architecture

Cloudflare Access (A/B identities, deny by default) -> dedicated staging hostname -> `herreb-emp003-staging` Worker using existing `src/worker.ts` and built console -> isolated `EMP003_CAMPAIGN_STATE` Durable Object (with prerequisite DO classes in the existing Worker) -> staging-only D1/KV where required. `herreb-workforce-staging-gateway` is not an application proxy until its forwarding, Access JWT validation, and upstream service binding have been implemented and tested. Prefer routing the Access-protected hostname directly to the dedicated app Worker; do not forward through Hello World.

## Manifest scope and explicit omissions

`wrangler.emp003.jsonc` defines a separate Worker name, local app source, SPA assets, Workers AI, Browser, four DO classes/migration tags copied from existing production manifest, and staging D1/KV IDs. It deliberately has `workers_dev=false` and **no routes**; therefore it cannot be reached externally by itself. No production service bindings, Meta credentials, tenant manifests, Access audience, queues, cron triggers, or deploy hooks are copied. Queue remains unused/inactive until a real EMP-003 consumer is identified.

**Important:** This is a candidate manifest, not validated executable staging. Confirm relative config paths and generated assets using read-only Wrangler validation/dry-run in isolated CI; confirm runtime startup, access policy and required bindings before any deploy. If `src/worker.ts` requires other bindings, supply only dedicated staging services or fail closed. Do not fall back to production. Tenant A/B identity mapping and Access team/audience must be provisioned through protected environment configuration; never copy the production identity map or access audience. Validate that Worker endpoints cannot bypass Access via direct routes or service bindings.

## GO prerequisites — WF-01 and WF-04

1. Owner verifies actual staging hostname/route and Access application (allow tenant A, allow authorized tenant B separately, reject unauthenticated and unauthorized actors), JWT audience and identity-to-tenant mapping. A login screen alone is insufficient.
2. Read back Worker bindings: D1/KV IDs match this file, DO namespace belongs to staging Worker, and no production CRM, calendar, Sales Ops, Meta, Queue, secrets, or service bindings. Confirm whether EMP-003 needs D1 or KV at all.
3. Read-only Wrangler config validation and build/CI at exact PR SHA; obtain review from independent WF-04. Confirm DO migration v1-v4 applicability to a **new** Worker; do not apply production DO migrations or reuse DO IDs.
4. Check Cloudflare Builds, Git integration, Deploy Hooks, Wrangler/API tokens, GitHub workflows and ruleset #25484495 for every publication path. No unapproved automatic deploy.
5. Prepare rollback to the previous **staging app Worker** version (once it exists); because initial deployment has no previous app version, initial recovery is disable staging route/Access, retain isolated data, and redeploy a reviewed known-good version. Do not describe this as a tested rollback. DO schema migration recovery is forward-fix/restore from isolated backup as applicable; ordinary code rollback does not reverse DO migrations.
6. WF-01 formal SECURITY GO and WF-04 independent RELEASE GO, exact-head CI PASS, real tenant A/B E2E, read-back, approved recovery plan, then operator-authorized controlled deployment. Without dual GO, no merge, deploy, migration or secrets changes.

## Owner's single evidence package

In Cloudflare Workers & Pages open `herreb-workforce-staging-gateway` -> Production -> Deployments and Settings -> Bindings / Domains & Routes, plus Zero Trust -> Access -> Applications. Capture the existing gateway version, absence of bindings, proposed staging hostname and Access application policy (redact emails and tokens). Include the D1/KV/Queue resource IDs and any DO namespaces. Attach one redacted package to Issue #281. Do **not** click Save, Deploy, Migrate or Rollback.

## Status

All seven Stage-0 certification gates remain BLOCKED pending effective Cloudflare state and real A/B tests. This PR is PREPARED only; it does not close Stage 0.


## Integrated delivery candidate — 2026-10-27

The delivery branch combines EMP-003 browser persistence with the separately reviewable EMP-002 native calendar portal (#302) and EMP-001 Sales Ops authority correction (#303). The EMP-003 staging entry still deliberately exposes only EMP-003: it is **not** a staging deployment manifest for all three employees. No new deployment is authorized by these changes.

### Short operator manual (candidate, not currently deployed)

- EMP-002: the authenticated portal chat reads agenda and availability from the same tenant-native Durable Object; it does not use a CRM or Google fallback and directs mutations to the native form. Open **Agenda y tareas**, load the date range, create a meeting or task, then load it again independently. Select an existing entry to edit or cancel it. A conflict/error requires reloading before retry; never overwrite a stale version. Set the optional portal reminder time on a meeting/task. Due reminders are read from native persisted entries and refreshed every minute while the portal is open. Edit and clear that time, then save with CAS, to dismiss it; cancelled entries never appear. This is an in-portal reminder, not background push or WhatsApp delivery. Cloudflare E2E remains required.
- EMP-003: open **EMP-003**, create or select a campaign, complete its content, save, and verify the independent read-back confirmation. Reload the page and reopen it. Review transitions require the server-authorized owner; APPROVED campaigns cannot be edited. External publication is disabled. Two-tenant browser certification and the complete existing six-stage flow remain release gates.
- EMP-001: the actual selling channel is Meta WhatsApp. Open **EMP-001** to read the live catalog or retrieve an order by ID independently. This view never creates orders or sends WhatsApp messages. It requires SALES_OPS, a server-side SALES_OPS_TOKEN, and an explicit SALES_OPS_TENANT_ID matching the authenticated tenant; no production credential fallback is allowed. Browser/Meta E2E is not yet certified. The runtime/adapter deployment dependency in herreb-runtime #27 is not changed here. Its connected Builds have historically published non-main commits: no runtime branch may be pushed until the operator verifies publication is fenced.
- Tenant/user administration must use the authorized Workforce administrative interface and separate identities. Do not add the B identity to HerreB Owner or the platform administrator allowlist. Current candidate user roles are read-only; tenant A needs an explicitly approved owner identity for write certification.

### Prior preflight and required decisions

1. **WF-01 SECURITY** must approve the exact candidate SHA, dedicated EMP-003 application, hostname, issuer, AUD and server identity map: A maps to herreb-client-0; B dito37@hotmail.com maps only to provisional herreb-emp003-test-b with role user. Read back B's effective exclusion from HerreB Owner without changing that application. A login screen or a JSON proposal is not effective-policy evidence.
2. **Cloudflare operator** must inventory actual API/Builds/Git/deploy-hook publishers and effective token metadata without exposing values. Do not reuse GitHub HerreB Deploy. Workers Scripts Edit is account authority; do not describe account-scoped credentials as cryptographically restricted to one Worker. Decide between stronger account isolation and an explicitly reviewed, short-lived operator credential constrained by expiry/source IP and operational script allowlist. Omit DNS/routes and D1/KV data-write authority from the initial code-publication credential. Review any unavoidable permission expansion explicitly.
3. **WF-04 RELEASE** must approve separate resource names/IDs, migration tags and the first-deploy recovery plan. New staging DO namespaces must belong to the new staging Worker; do not bind production namespaces. D1/KV IDs above are inventory candidates until effective read-back; the separate Sales Ops schema candidate in services/sales-ops/migrations has never been applied. Check legacy duplicate quote orders and backup feasibility before approving it.
4. Record two independent formal decisions for **staging creation/certification**, exact SHA and exact environment. This is distinct from a later product release approval. Until both decisions and operator authorization exist: no merge, deploy, migration, secret or Access changes.

### Later authorized execution and read-back (not performed)

1. Fence all automatic publication paths, approve the environment and credential custody, and establish dedicated Access and server-side identity configuration through the authorized operator. Never place credentials in issue comments.
2. Initial EMP-003 publication uses the dedicated manifest with no routes, workers.dev=false and preview_urls=false. The script is initially unreachable. Record upload/deployment ID and exact source SHA. Read back all four staging DO namespace IDs, v1-v4 migration state, D1/KV bindings, absence of production service bindings/queues/triggers and absence of public URLs **before** attaching the approved Access hostname. Do not attach an unprotected route even temporarily.
3. After the approved protected route is attached, verify unauthenticated/unauthorized denial, correct issuer/AUD, tenant A access, tenant B isolation and HerreB Owner denial. Execute a single EMP-003 E2E session covering create, CAS edit, reload, independent GET, immutable APPROVED and read-back failure behavior; publish no external campaign.
4. Sales Ops and native calendar need their separately approved isolated manifests/resources and credentials before their real E2Es. EMP-001 requires a real Meta conversation, duplicate/retry handling and a single authoritative order independently recovered by GET. EMP-002 requires native persisted meeting/task CRUD and tenant isolation, plus actual reminder/conversation certification. Local SQLite/CI results do not substitute for these.
5. For an initial incident, stop only staging ingress/publication and consumers as applicable; preserve the staging Worker, DO namespaces, D1 and KV. Do not delete resources, remove DO classes or replay ambiguous Meta sends. There is no previously deployed app version to roll back to on the first deployment. Review and publish a forward-fix against the retained data after renewed applicable GO. A code rollback does not undo DO/schema migrations. Record restoration evidence before calling recovery tested.
