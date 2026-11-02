# Campaign review: pin displayed content

This increment closes the remaining review gap after asset-level approvals. The browser campaign-review endpoint now requires `blueprintRevision` and `blueprintHash` in addition to campaignId/from/to/reason/idempotencyKey. The shared digest validates the existing blueprint schema and canonically orders object keys; array order and actual content remain significant.

The editor hashes the displayed blueprint, including any unsaved changes. The BFF compares the revision/hash with its independent draft GET and returns HTTP409 for stale or unsaved content. It forwards the pin to the DO transition; the same revision/hash is checked again inside the existing transaction before review state or audit writes. A race after BFF preflight therefore cannot approve different content. Each successful transition stores a separate immutable pin receipt bound to tenant/campaign/correlation/idempotency key. A replay with a different pin fails.

The existing `/review` DO GET returns a pin only when it matches the latest transition correlation. The BFF independently checks that receipt and the editor validates and displays the exact confirmed revision/hash. State transition policy and approval role are unchanged; no publication is enabled.

Compatibility: old open browser tabs without content pins fail closed and must reload. Existing internal M2M transition calls retain their prior optional contract; they are not newly certified as content-pinned approvals. The EMP003 staging ingress does not expose those internal routes. Existing stored reviews with no pin are not retroactively represented as pinned approvals. Any future production integration must inventory non-browser review consumers before tightening that separate contract.

Affected tests: signed-JWT BFF pin requirement/forwarding/read-back; SQLite transaction rejection when content changes after preflight; exact approval receipt and idempotent replay; canonical hash behavior; browser review input and displayed checked receipt; existing review transaction and campaign UI regressions. All are local tests, not real Cloudflare A/B evidence.

No merge/deploy, configuration, secrets, migrations or external publication. WF01 SECURITY and WF04 RELEASE independent GO for exact candidate/environment plus specific owner authorization remain mandatory. Execute the A/B and integrity procedure in `copy-lifecycle-contract.md` only after these gates.
