# Copy governance UI increment

Stacked on the lifecycle backend PR315; no changes to PR313, PR314 or the current pilot.

- Creative Studio opens the existing immutable copy record, separately GETs the authoritative Brand Brain and exact approval, and enables manual edits only for an owner on the current head of a DRAFT campaign.
- Saving sends CAS/base hash and campaign/profile revision/hash. The server receipt must confirm a new revision; the existing library then performs its own content GET and SHA256 check before success is displayed. Prior revisions remain in the existing selector.
- The exact request is saved in tenant/campaign/asset-scoped sessionStorage before transmission. A lost response keeps the same operation; explicit recovery replays it without calling AI. This pending record is not an authoritative asset store.
- The approval checkbox refers to the saved text, not an unsaved editor buffer. It is disabled until text matches the loaded revision. Approval sends exact revision/hash/context pins and requires a separate approval GET before confirmation. A historical receipt is never shown as an active approval for a different version.
- Read-only identities cannot edit/approve. Brand Brain is an own-tenant read-only section showing server-approved facts/restrictions and immutable profile history; no browser form can set verified claims. Wrong-tenant responses are rejected before facts are displayed.
- Calendar stays a projection of saved campaign dates. No publication, connector, budget or reminder action is added.

Affected checks exercise rendering and requests with local fixtures and the existing library/dashboard integration tests. They do not certify deployed Cloudflare A/B. The real procedure and HTTP/integrity requirements remain in `copy-lifecycle-contract.md`.

Deployment stays blocked until independent WF01 SECURITY + WF04 RELEASE GO for exact SHA/environment and specific owner authorization. In the real session, open campaign, generate v1, edit to v2, independently GET both, approve v2/hash, create v3 and verify no inherited approval, then use B to prove scope/role denials and return to A for integrity hashes.
