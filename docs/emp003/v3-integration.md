# EMP-003 V3: connected increment and executable integration

## Frozen inputs and evidence

- Backend base: PR [313](https://github.com/dito2001-art/herreb-employee-core/pull/313), SHA `98626b213c8a24049929ffb1b9cce5c3e79e2d13`, unmerged at inspection. Main does not contain `src/emp003-pilot.tsx` (contents API 404); do not treat the candidate as integrated into main.
- Approved V3 reference: [index(6).html](https://chatgpt.com/library?file_id=libfile_17d1c61802408191ab4b73379aa2c6fd&account_id=personal), SHA256 `909b36c11b67823df50406786d53012954b8bf697ef33251b6da557bceb947c5`. Original is unchanged.
- V3 `studioMakeCopy` constructs deterministic strings; `studioSaveData`, `studioSaveCopy`, `studioDecision`, `studioSync` persist/change localStorage. There are no fetch calls. `setTenant` changes a local variable. Seeded clients, assets, spend, impressions and conversions are fictional. Local tenant keys are not an authorization boundary.
- Existing real pilot #313: version `1d1b936c-592c-482e-8ead-9691a0faa366`, operation `e42033a0-b6d9-45bc-8a15-e1b8d16ac179`, asset `copy-46e76223-3246-4137-ac44-3a8de7772888`, revision 1, 252 UTF-8 bytes, SHA256 `58900c03e6b3cc004f7560381b8bb542c8ad57cd93f4b377fd4b3e66de6b4bec`. A generation/list/reload/independent GET is existing evidence, not a live test of this increment.
- [Independent content URL](https://herreb-emp003-staging.herreb-emp003-pilot.workers.dev/api/emp003/assets/content?campaignId=campaign-ed9ba4da-4638-4563-9371-11762592bc98&assetId=copy-46e76223-3246-4137-ac44-3a8de7772888&revision=1).

## Actual versus simulated

| Capability | Existing implementation to reuse | Gap / disposition |
|---|---|---|
| Brief/campaign editor | `emp003-campaign-dashboard.tsx`, blueprint schema/repository, browser draft handler | Connected existing form, not a second campaign store. V3 offer/tone/format fields are not silently mapped to authoritative claims. |
| Campaign IA proposal | `emp003-browser-generate.ts`, grounded generation/research | Real existing provider; authorized research hosts required. A generated proposal is not saved until draft write/read-back. |
| Creative copy | `emp003-copy-library.tsx`, copy routes/service/generator, DO metadata, private R2 | Real Workers AI JSON schema, versions, hash and independent read-back. This increment composes that UI, not the demo generator. |
| Creative editing | V3 mutates the last local version in place | No authenticated manual-copy version write endpoint exists in the pilot ingress. Do not implement editor by bypassing immutable R2/version receipts. Separate grounded edit contract needed. |
| Brand Brain | `emp003-copy-context.ts`, server-owned EMP003_COPY_CONTEXTS_JSON | Authoritative tenant/campaign revision/audience/offer/knowledge/claims. No browser management API; new/edited campaigns need explicit authorized context configuration. |
| Editorial approvals | campaign review endpoint/review state/CAS and dashboard | Campaign states DRAFT/IN_REVIEW/APPROVED/REJECTED supported. Browser review input carries from/to/reason/idempotencyKey, not expected blueprint revision; approval of an exact displayed content revision needs an explicit separate contract before presenting content-level CAS in V3. This is not asset approval, publication authorization or independent release GO. Owner is current editorial writer/reviewer; no fabricated four-eyes workflow. |
| Calendar | persisted blueprint schedule startDate/endDate | New read-only projection of real dates from operations. No second schedule table, queue, alarm or reminder created. Dates are never called scheduled publications. |
| Publication | core `campaign-execution.ts`, gated publisher/preflight abstractions | Reuse later after connector/dispatcher authorization. Pilot ingress does not expose scheduling/publication. No external connector is enabled here. |
| Assets beyond copy, metrics, optimization, remarketing | domain modules/abstractions exist | V3 UI is simulated; not certified live. No images/videos, spend or invented performance added. |
| Tenant selector / global Control Center | V3 six local fictional tenants | No authorized-tenant enumeration contract. Connected UI displays only the identity-derived tenant and its campaign counts; no cross-client selector. |

Source links use the frozen base, for example [ingress](https://github.com/dito2001-art/herreb-employee-core/blob/98626b213c8a24049929ffb1b9cce5c3e79e2d13/src/staging/emp003-entry.ts), [copy routes](https://github.com/dito2001-art/herreb-employee-core/blob/98626b213c8a24049929ffb1b9cce5c3e79e2d13/src/runtime/emp003-copy-routes.ts), [campaign UI](https://github.com/dito2001-art/herreb-employee-core/blob/98626b213c8a24049929ffb1b9cce5c3e79e2d13/src/emp003-campaign-dashboard.tsx).

## Contracts, ownership and fences

All browser requests use same-origin credentials, cache no-store, no API token in the frontend. Dedicated Access JWT issuer/AUD and identity mapping are verified at ingress and BFF; tenant is server-derived. Existing routes are unchanged:

| Route | Input / output | Gate |
|---|---|---|
| GET /api/emp003/operations | tenantId, campaigns with blueprint/reviewRevision/reviewState, permissions.canWrite | owner/user, validated tenant in every blueprint, duplicate IDs rejected |
| GET /api/emp003/drafts?campaignId= | campaign, revision, found | authenticated tenant-scoped DO |
| POST /api/emp003/drafts | existing campaign write contract, expectedRevision/createOnly | owner, CAS; reviewed draft immutable409 |
| POST /api/emp003/generate-campaign | existing grounded proposal contract | owner; no automatic draft persistence |
| POST /api/emp003/review | campaignId,from,to,reason,idempotencyKey | owner; authorized state transitions; client does not submit a blueprint revision |
| GET /api/emp003/assets/context?campaignId= | campaignRevision, channels, canGenerate | server profile linkage, current campaign revision |
| POST /api/emp003/assets/generate | campaignId,assetId,operationId,expectedRevision,campaignRevision,channel | owner, authoritative claims, daily reservation, idempotency, immutable revisions |
| GET /api/emp003/assets?campaignId= | assets scoped to authenticated tenant and campaign | owner/user; no tenant parameter |
| GET /api/emp003/assets/content?campaignId=&assetId=&revision= | text/plain exact bytes, x-content-sha256/x-asset-revision | campaign/tenant lineage; no public R2 URL |
| GET /api/emp003/assets/status?campaignId=&operationId= | operation state/record or scoped failure | owner/user, campaign lineage; no blind replay of STARTED |

New workspace/calendar reads only operations; no new endpoint, storage, binding, migration or publication capability. Existing dashboard/library independently authenticate every BFF request. Sections stay mounted across navigation to preserve unsaved edits; tenant changes key/reset that subtree. Auth/shape failures remove the previous summary and UI, with no demo fallback. React escapes persisted labels; no HTML injection from demo templates.

The date list is deliberately a first calendar integration, not the V3 month-grid feature. Fonts use Montserrat if available; a packaged licensed font/official logo must be supplied before claiming exact visual parity. No third-party font download is added by this increment.

## Increment and validation

`EMP003Pilot` now mounts `EMP003Workspace`: truthful workspace summary, existing campaigns/review UI, existing Creative copy UI, calendar projection. Modules with no real backend are explicitly labeled unconnected instead of shipping decorative controls or simulated metrics.

Affected checks: workspace projection + React integration tests, existing campaign dashboard and copy-library regression tests, TypeScript, affected lint and build. Tests use local fixtures to verify composition and failure boundaries; they are not Cloudflare A/B evidence. Safe PR CI has contents:read, pinned actions, exact-head checkout, persist-credentials:false, no secrets, token or deployment step.

## Blocking decisions and executable sequence

1. **Engineering / this PR:** review exact SHA and safe CI. Keep #313/pilot frozen. No merge or deployment from this work.
2. **Owner / test session:** connect B (`dito37@hotmail.com`, tenant `herreb-emp003-test-b`, user) to Work. Current browser inventory contains no pilot tab. Real B list/GET/status denial for A's version1 asset is still BLOCKED; no claim of a tenant leak or PASS. Read operations first to prove tenant B, then issue those GETs and capture actual HTTP codes through an authorized observable surface; do not infer codes from JSON. Return to A and re-hash the 252 bytes. No credentials exported.
3. **Engineering + product owner:** define manual copy edit version contract before adding V3 editable copy: source asset revision CAS, campaign revision pin, verified claim lineage, quota policy (no model spend for manual edits), idempotent operation, immutable object/hash/read-back; preserve APPROVED campaign immutability. Then add BFF/service write reusing the asset library. Do not mutate the last local version as V3 does.
4. **Owner + engineering:** agree how users request server-side Brand Brain/campaign linkage. Until authorized configuration exists, new campaigns can be saved but copy generation correctly remains blocked. Do not trust brief offer/tone as verified knowledge.
5. **WF-01 SECURITY / WF-04 RELEASE:** independent formal GO for the reviewed exact SHA and pilot environment, with A/B evidence and recovery. Neither approval is emitted here. Only after dual GO and specific owner authorization may merge/deploy occur. Existing resources and previous pilot version form the code recovery path; data retention is separate and storage versions are not rolled back.
6. **Authorized QA:** execute real connected V3 A create/edit/save/reload/GET, proposal and copy generation/status/list/hash, real asset multiple versions/CAS and immutable approvals. B own list/foreign direct GET/foreign status and write denial, followed by A integrity read-back. Existing #313 A evidence stays valid for #313 only; do not relabel it as this new SHA.
7. **Later, separate authorization:** publication/measurement connector and scheduling only after official account scopes, explicit channel, consent/budget caps, idempotency receipts and recovery are approved. No external publication is part of this increment.

**Decision: code increment reviewable; SECURITY/RELEASE NO-GO for V3 deployment until dual formal GO and real new-SHA certification.**
