# WF-01 security and multi-tenant certification (2026-10-15)

## Scope and evidence
Baseline: PR #267 merged, commit b11a9e8f72aa5b5364a9fab5517398dd92376c3c, deployment https://github.com/dito2001-art/herreb-employee-core/actions/runs/38760660816.
This change set adds a release gate and removes an untrusted admin-DO email fallback. It does **not** certify live multi-tenant operation, alter EMP-001/002/003, or deploy.

## Certification matrix
| Scenario | Automated evidence | Live acceptance before customer launch |
|---|---|---|
| Cloudflare Access JWT: valid owner of tenant A reads only tenant A | workforce-admin-access-read.test.ts; verified issuer/audience/RS256/signature | Log in with two distinct Cloudflare Access users A and B; compare GET snapshots; no cross-tenant data |
| Forged Access email or internal role | workforce-admin-auth.test.ts; workforce-admin-access-read.test.ts | Attempt GET/POST with spoofed headers; 401/403 and no durable write |
| M2M tenant A requests tenant B | workforce-admin-tenant-owner.test.ts and admin auth tests | Valid M2M scoped A requests B, expect 403, no changes/audit exposes no foreign records |
| Owner revoked or downgraded | workforce-admin-store.test.ts; workforce-admin-access-read.test.ts; workforce-admin-auth.test.ts | With two real identities revoke/downgrade A; repeat GET/POST in fresh session and existing session, expect denial |
| Employee entitlements | tenant manifest/runtime tests | For A enabled subset and B different subset, ensure UI/agents/tasks scoped; unauthorized employee must deny |
| Durable store migration | bootstrap and persistence tests | Validate existing Client 0 state and audit readback before any destructive change |
| Platform-wide admin | workforce-platform-admin-auth.test.ts; scoped read | Explicit independent platform credential, no tenant owner privilege escalation |

**Limit:** no two real Cloudflare identities, seeded second tenant, Cloudflare audit trail or live E2E proof has been produced by this PR. Static/CI tests are not equivalent.

## Safe onboarding
1. Platform operator creates a ticket naming customer owner, approved tenant ID, enabled EMP list, namespace names, data retention terms, purpose, and approver.
2. Independently authorize YELLOW tenant creation. Existing tenant.create is intentionally deny-by-default and must not be bypassed by a caller boolean; keep an audited operator-only provisioning workflow as a separate reviewed PR.
3. Allocate unique tenant namespaces/storage IDs, verify absence of collisions, invite owner through Cloudflare Access, then persist owner binding and verify readback before enabling employees.
4. Execute A/B GET, POST and M2M negative tests, audit retained records, then independently approve release.
5. User offboarding: revoke Cloudflare Access immediately; deny access at Worker; remove or demote persisted identity through separately authorized audited identity-delete operation (currently YELLOW blocked). Verify old sessions fail, rotate tokens if exposed, and record retention handling.
6. Tenant offboarding: disable employees/ingress, revoke all identities and service tokens, export/retain data per agreement, and only then delete scoped resources under dual approval. Never repoint an existing email to a different tenant by GREEN upsert.

## Deployment policy and external configuration
- The core deploy workflows must be manual only, require a 40-character approved main SHA, and target the GitHub `production` environment.
- **Repository administrator must configure production environment protection with required reviewers and prevent self-review** in GitHub Settings > Environments > production. Merely naming an environment in YAML does not create a human approval requirement. Restrict environment branches to main.
- Keep Cloudflare production API token environment-scoped and least privileged; repository-level secrets alone do not enforce the environment gate.
- Treat PR merge as code integration, not deployment approval. WF-04 performs independent review of workflow changes and live acceptance evidence before any manual release.
- No automatic merge and no auto deployment on push; Cloudflare Access secret values must never be printed.

## Release gates
RED: any cross-tenant read/write, forged actor acceptance, inconsistent revocation or unapproved production deployment.
YELLOW: provisioning/deletion approval not built, Cloudflare Access two-identity E2E pending, environment reviewers unconfirmed.
GREEN only when scoped CI, independent WF-04 review, environment protection check, real A/B readback, audit and rollback evidence are archived with immutable URLs.

## Confirmed Cloudflare-native deployment bypass (RED)
On 2026-10-15 Cloudflare Workers Git integration commented `Deployment successful!` for **unmerged PR #270 commit e4041fdb**. Evidence:
- https://github.com/dito2001-art/herreb-employee-core/pull/270#issuecomment-6196648891
- https://dash.cloudflare.com/?to=/3519d3ab1a5b1dc4e629e661df78c150/workers/services/view/herreb-employee-core/production/builds/16c47e9b-3f17-4dc1-bcfa-88715d266286

This is independent of GitHub Actions and therefore **not controlled** by `workflow_dispatch`, `environment: production`, or GitHub reviewers. The Cloudflare comment confirms a successful deployment reported by its integration, but exact effective live Worker version and target must be verified from Cloudflare deployment history. Do not infer rollback or isolation from this comment.

**Required administrator remediation before approval of PR #270 or any other production release:**
1. Open Cloudflare dashboard for `herreb-employee-core`; record current production deployment version, commit SHA, environment, timestamp, source and deploy actor (attach redacted evidence to WF-04).
2. In Workers Builds / Git integration, **disable Cloudflare-native automatic production deployment** from branches and PRs; use preview-only builds if needed, with no production route or production secrets. If Cloudflare cannot enforce that policy, disconnect Git-based deployment entirely and retain only the protected GitHub Actions manual release path.
3. Confirm no secondary GitHub workflows, Cloudflare Deploy Hooks, API tokens or integrations can publish outside the protected release gate. Scope/revoke unnecessary Cloudflare deploy tokens.
4. Configure GitHub Settings > Environments > `production`: required independent reviewer(s), prevent self-review, main-only branch, environment-scoped Cloudflare deploy token. Restrict who can modify deployment workflows via CODEOWNERS / branch protection.
5. Perform a harmless branch/PR change in a non-production environment, confirm that **no production deployment occurs**, and archive Cloudflare audit/deploy history. Then test a manual approved release with an exact SHA, review record, deployment log and readback.
6. If an unapproved version is live, treat it as a deployment-control incident. Decide rollback only through authorized incident response, not via this PR. Verify tenant state and customer impact before changes.

**No live certification** can be marked GREEN until both independent release paths are controlled and A/B Cloudflare Access, M2M, entitlement and revocation tests pass.
