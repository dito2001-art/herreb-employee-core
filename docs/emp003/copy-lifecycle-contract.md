# Post-314: manual versions, exact asset approval and authoritative Brand Brain

Base: PR314 `2f3f109b20028ad06803ce1a4d1f1bbe4e6500c3`. PR313 and deployed pilot remain unchanged. This code is not live certified.

## Reuse and contract gaps closed

The existing marketing asset library already supplies content-addressed immutable objects, atomic metadata CAS/idempotency and hash-verified read-back. Existing copy generation provides the tenant/asset lock, server-owned context and authenticated BFF/DO boundary. We reuse them; no new bucket, namespace, migration, model or publication path.

The older `approveGroundedContent` function approves an in-memory content object, not a persisted asset revision/hash. It is not suitable as the authoritative asset receipt and is not relabeled as one.

New authenticated browser endpoints (dedicated staging allowlist only):

- GET `/api/emp003/assets/brand-brain[?revision=N]`: own-tenant brand/voice/restrictions, verified claim IDs/text/source knowledge IDs, server configuration revision and canonical SHA256. Historical snapshots are available after an authorized mutation has pinned that version. `editable:false`, `source:SERVER_CONFIGURATION`. This GET does not install profiles or create history.
- POST `/api/emp003/assets/edit`: strict JSON `{campaignId,assetId,operationId,expectedRevision,baseSha256,campaignRevision,contextRevision,contextHash,text}`. Owner only, same-origin, maximum 12,000 characters/64KiB request, no client tenant/claim/knowledge fields. Response includes immutable `record` and `readBackConfirmed:true`. Separate content GET is still required by the portal.
- POST `/api/emp003/assets/approve`: strict JSON `{campaignId,assetId,operationId,revision,sha256,campaignRevision,contextRevision,contextHash,claimsReviewed:true}`. Owner explicitly attests to the displayed bytes and server verified claims/restrictions; current head must equal exact revision/hash and no edit/generation can be in flight. This does not authorize publication.
- GET `/api/emp003/assets/approval?campaignId=&assetId=&revision=`: exact approval receipt or null, `active` against current asset head, campaign revision and current authoritative context hash. A new asset revision never inherits an old approval.

All routes verify JWT issuer/AUD and role; tenant/actor are derived server-side, internal actor headers are recreated from verified identity. B user can read only its own data and cannot edit/approve. Clients cannot supply a verified claim or change Brand Brain using these routes. New campaign/review state contracts are not weakened.

## Invariants and recovery

Manual editing writes a new DRAFT revision through the existing library; old revisions and object hashes remain recoverable. No AI call and no generation-quota debit occurs. Provenance records manual actor, source revision/hash, campaign/context revision/hash and `claimsVerified:false`. Manual text is untrusted: an owner approval is a human attestation, not automatic factual verification or promotion into the claim registry.

A reservation shares the existing per-tenant/campaign/asset generation lock. Receipt fingerprint covers exact input plus authenticated actor, and the createdAt is pinned once, so concurrent/lost-response retries do not change the library fingerprint. Same operation with changed text conflicts. Accepted writes recover via their immutable library receipt and independently verified bytes, even if context subsequently changes; they are not rewritten under new rules. Transient read-back ambiguity retains the lock and exact operation for recovery. Definitively rejected, uncommitted edits release only their own lock and retain a FAILED receipt; a new user intent needs a new operationId. No clearing another operation's lock.

DO transaction guards recheck campaign DRAFT/revision, profile head/hash and edit lock ownership at accepted metadata writes. APPROVED/IN_REVIEW campaigns cannot acquire new assets or approvals through this path. Asset approval occurs before campaign review; campaign approval and asset approval remain distinct. Approval records are immutable, actor/time stamped, and tied to tenant/campaign/asset revision/hash plus campaign and profile revision/hash. Existing receipts remain historical; new revisions/context changes do not inherit them.

Brand Brain is provisioned only by the existing deployment-owned `EMP003_COPY_CONTEXTS_JSON` path. Authorized mutations pin immutable DO snapshots and a monotonic revision/hash head. Same-version altered configuration and rollback to a lower pinned revision fail closed. Verified claims are filtered by the existing marketing brain and verified knowledge/source rules; missing or foreign tenant claims are rejected. Changing server configuration requires its own review and authorization; no secret/config/resource update is performed by this PR. This is not a browser-admin profile editor or a new independent claim-approval workflow. Snapshot scope includes the full tenant configuration, so even an unrelated linkage change requires a new profile revision and conservatively invalidates old approval activity.

Recovery is forward-fix or code rollback after applicable authorization; preserve metadata/R2. No automatic deletion, data migration, publication or budget spending. An old Worker lacking these monotonic guards must not be run concurrently as a writer once the new contract is in use; reviewer must decide compatible code rollback vs disable-write/forward-fix. Data is not rolled back with Worker versions.

## Evidence and certification gates

Local tests exercise the actual Access verifier/BFF/DO handlers with signed fixture identities, SQLite atomic transactions and an object-store fixture. These are not Cloudflare identities or live HTTP evidence. They cover immutable bytes/revisions, duplicate/concurrent edits, stale CAS, exact approval/replay/no inheritance, foreign tenant reads/writes, unknown client claims, profile version conflicts/history, review during object write, and accepted-write recovery after read-back loss. Existing generation/lock/ingress/UI regressions are affected checks.

Before real E2E: independent WF01 SECURITY and WF04 RELEASE GO for exact code and pilot, plus specific owner authorization. No merge/deploy in this work. Configure a reviewed server profile linked to the exact test campaign revision; B remains dito37@hotmail.com, user, herreb-emp003-test-b. Never repurpose HerreB Owner.

Real sequence after authorization:
1. Record deployed SHA/version and profile revision/hash, resource bindings and authentication gates; no unprotected ingress.
2. A reads persisted campaign and generates copy; independently GET bytes/hash (existing PR313 252-byte evidence remains tied to PR313 only).
3. A edits revision1 → revision2; GET both separately and compute UTF-8 hashes; repeat same operation exactly and show no extra revision. Submit a different operation with stale revision and record actual HTTP409.
4. A approves revision2/hash/campaign/profile; independent approval GET confirms exact receipt. Create revision3 and prove no inherited approval. Verify stale campaign/context prevents approval.
5. B session proves tenant B from authenticated operations. Record actual HTTP status, sanitized JSON and response type for list, direct A content GET, A operation status, A approval GET, Brand Brain and edit/approve denial. A's IDs alone never change scope. Do not export JWT/cookies or infer HTTP codes from a page body.
6. Return to A, GET all accepted revisions and compare original hashes; confirm no changes, no publication. APPROVED campaign write rejection must preserve bytes.

Current blocker: new contracts are not deployed and real B session/HTTP evidence has not been supplied to these tests. SECURITY/RELEASE NO-GO; no independent approval is claimed.
