# WF-02 native calendar conversational integration contract

Status: BLOCKED / NOT CERTIFIED. Source inspection 2026-10-15. No deployment authorized.

## Current routes
- `src/worker.ts`: M2M tenant-owner API `POST /api/internal/emp002/native-calendar` proxies to tenant Durable Object.
- `src/runtime/emp002-operations.ts`: `POST /native-calendar` supports get/list/save, tenant enforced by Durable Object identity, version conflicts and read-back.
- `src/runtime/emp002-operations-transports.ts`: conversational read/write still delegates to `CRM_CAPABILITY ?? AG002_GATEWAY` and returns `HERREB_CRM` as source. This is NOT the native Workforce calendar.
- `src/server.ts`: intentionally disables legacy personal CRM/Google calendar for EMP-002; conversational native calendar connection is missing.

## Required implementation (do not fake passing results)
1. Provide an internal native calendar transport backed by the same tenant-specific `EMP002Operations` Durable Object. Never make a public HTTP round trip using a platform-wide admin token. Bind the transport to the trusted tenant context and verify tenant ID on every operation.
2. Make portal calendar read/write and WhatsApp owner commands use this native transport; reject unavailable native binding (fail closed), with no fallback to `AG002_GATEWAY`, `CRM_CAPABILITY`, or Google.
3. Map calendar search, availability, create, update and cancel onto native get/list/save. Validate timezone, RFC3339 instants, duration, ownership, IDs, and expected version. Return authoritative IDs and versions.
4. Idempotency: persist operation outcome by tenant + inbound provider message ID / request key before acknowledging; prevent duplicate event creation on webhook retries. Explicitly handle uncertain send outcomes.
5. Calendar reminder scheduling must use tenant-owned native state, with durable deduplication and cancellation handling.
6. E2E tests: portal and WhatsApp read/create/update/cancel, read-back after object recreation, two tenants with same entry ID, unauthorized/malformed requests, stale versions (409), missing Google credentials, duplicate inbound, reminders.
7. Do not merge or deploy before independent WF-01 security review, WF-04 E2E review, and release gate.

## Acceptance evidence
- Exact test command and workflow run URL at final SHA.
- Redacted request/response traces with correlation IDs and tenant isolation assertions.
- Explicit list of untested production behavior.

## Parallel EMP-001
Issue #285 tracks real external `EMP001_WHATSAPP` implementation discovery and Sales Ops integration. Its code is not in this repository. No inferred endpoint contract or simulated test should be represented as a real order.
