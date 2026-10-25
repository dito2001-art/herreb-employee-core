# WF-01 / EMP-003 staging — PREPARED, NOT APPROVED

This change **does not deploy or migrate anything**. It does not modify the existing Cloudflare Hello World gateway, production wrangler.jsonc, CI workflows, credentials, DNS or Access policy.

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
