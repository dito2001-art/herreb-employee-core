# EMP-001 private runner candidate

Review-only implementation based on Core PR #330 SHA 4ecd3b2e43818f7b4aac3de8656fa8469a9a7350.

The runner allows POST /internal/emp001/chat only. Its input accepts a message and optional session_id. Access JWT is verified cryptographically with an explicitly configured RS256 public JWKS, issuer, audience and validity times. A server-controlled principal map resolves exact subject and email to one role, tenant and A/B slot. Runtime Service Bindings and bearer tokens are separate per slot.

The caller cannot provide tenant_id, channel, customer_id, operation_id or arbitrary privileged fields. The runtime and Sales Ops still must independently authenticate their own callers. Access identity does not automatically propagate across Service Bindings.

The Wrangler manifest disables the runner by default and declares no public route, workers.dev, preview URL or cron. The manifest is not an authorized deployment. No actual Access app, principals, secrets, D1, DO, R2 or Runtime A/B services are provisioned by this branch.

This is a restricted chat ingress, not a direct order-concurrency harness. It does not certify create_order CAS, independent GET, or Sales Ops persistence. WF-01 must independently approve JWT trust and key rotation, principal mapping, ingress and per-hop credentials. WF-04 must approve the final SHA, configuration, isolation and rollback. Until then SECURITY/RELEASE NO-GO.
