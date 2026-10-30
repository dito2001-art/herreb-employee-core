# EMP-002 — local workerd integration gate (NOT YET CERTIFIED)

This is an execution contract, **not** evidence that workerd passed. Never use a live
Meta token, Cloudflare remote bindings, production tenant manifests, or cron.

## Required test harness

- Run the **real** `EMP002Operations` class inside an isolated local workerd
  runtime (Miniflare or Wrangler local) with a SQLite-backed Durable Object
  binding named `EMP002_OPERATIONS`.
- Use two named instances created with `idFromName('tenant:tenant-a')` and
  `idFromName('tenant:tenant-b')`. Verify that `state.id.name` is populated
  by the runtime; do not emulate it with a plain object.
- Supply a test-only `TENANT_MANIFESTS_JSON` with unique
  `reminderOwnerWhatsapp` values already present in each tenant's
  `whatsappOwners`. Use synthetic numbers, never production numbers.
- **Intercept all Meta HTTP requests inside workerd**, returning deterministic
  mock responses; fail the test immediately if any outbound request targets a
  real host. Prefer dependency injection into
  `buildEMP002WhatsAppTransport` so the fake transport can be paused,
  rejected, or resolved without a real network call.
- Use an explicit fake clock or due timestamps in the past, and distinct
  tenant-specific test data.

## Assertions required for release gate

1. **Cancel before claim**: create a due native calendar entry, cancel via
   `/native-calendar`, then execute: zero mock Meta calls.
2. **Concurrent execute**: issue two `/internal/native-reminders/execute`
   requests to the same real DO before resolving the fake Meta call. Exactly
   one mock send; the second request cannot reclaim UNKNOWN.
3. **Cancel after claim**: pause fake Meta after the durable UNKNOWN
   transition; cancel the calendar entry; release mock send. No second send
   or resurrection of the old calendar version. Cancellation cannot retract
   an already-authorized dispatch.
4. **Timeout**: reject the fake Meta request; subsequent execute must not
   send again; inspect persisted UNKNOWN by an independent DO request.
5. **SENT**: resolve the fake transport with a valid synthetic
   `wamid.test-1234`; inspect the persisted SENT status and provider ID via
   an independent read (a response body alone is insufficient).
6. **Tenant A/B**: B cannot claim, reconcile, list or read A's action;
   wrong `x-herreb-internal-tenant-id` must return 403, even with the
   test-only internal token.
7. **No public ingress**: no public Worker route may forward
   `/internal/native-reminders/*` or permit caller-controlled tenant
   headers; verify router explicitly.
8. **No scheduling side effects**: do not enable scheduled dispatch of
   native reminders.

## Implementation blockers (do not waive)

- `src/runtime/emp002-operations.ts` directly constructs
  `buildEMP002WhatsAppTransport` inside execute. A test-only injectable
  transport/fetch seam is needed for deterministic network pause/timeout
  without modifying production behavior.
- The native reminder store has no authenticated **read-only status**
  endpoint. An independent read-back must be added, internal-token-gated
  and tenant/DO-bound, or performed using a separate local DO inspection
  mechanism; do not treat the execute response as read-back.
- Existing `src/runtime/emp002-native-reminder-store.test.ts` and
  `src/runtime/emp002-reminder-do-auth.test.ts` run under Node/SQLite,
  **not** workerd. Their CI PASS is not this release gate.
- The project has `wrangler` as a dev dependency but no committed
  Miniflare integration harness/config for this scenario.

No production configuration change or deployment is authorized by this file.
