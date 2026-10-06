# EMP-001 V1 — release evidence and operating runbook

Status date: 2026-10-06

## Scope

EMP-001 AI Sales Rep only. This document does not authorize changes to EMP-002, CRM, AG-002 or EMP-003.

## Verified production topology

Meta WhatsApp Cloud API (Graph v26.0) -> herreb-emp001-meta-whatsapp-adapter -> inbound Queue -> herreb-emp001-runtime -> AI Router / Sales Ops -> adapter -> Meta WhatsApp.

Employee Core retains the EMP001_WHATSAPP and SALES_OPS service bindings used by the shared workforce runtime.

## Production E2E evidence

A real WhatsApp conversation was exercised after correcting the adapter routing configuration.

Verified behavior:
- real WhatsApp inbound reached the adapter and queue;
- adapter processing reached runtime and generated a reply;
- Meta outbound succeeded after replacing an invalid access token;
- multi-turn context was retained;
- catalog-backed demo recommendations and prices were returned;
- cheaper alternative request changed the recommendation;
- quantity arithmetic: 2 x Gs. 72,000 = Gs. 144,000;
- upsell: Malbec Reserva Demo at Gs. 95,000;
- final basket total: Gs. 239,000;
- the assistant advanced toward payment without claiming the purchase was already completed.

## Incident found during E2E

Observed error:
`Subrequest depth limit exceeded`.

Root cause:
the EMP-001 adapter had an EMP-002 phone-routing configuration that could classify the EMP-001 inbound as EMP-002 and route it back to Employee Core. Employee Core then routed the text inbound back through EMP001_WHATSAPP, creating a recursive Worker chain.

Immediate production correction:
`EMP002_PHONE_NUMBER_ID` was removed from the EMP-001 adapter configuration after the EMP-002 workstream confirmed EMP-002 does not depend on that variable or callback.

Permanent source cleanup still required in the historical adapter source:
remove the obsolete `isEmp002Payload() -> EMPLOYEE_CORE` routing branch. Do not recreate or replace the historical worker while it remains recoverable in Cloudflare.

## Authentication incident

After the recursion fix, the adapter reached Meta outbound but Meta returned:
- HTTP 401
- OAuthException
- code 190

The Meta access credential was replaced in Cloudflare as a secret. The subsequent real WhatsApp reply succeeded.

Never store or document credential values here.

## Required production configuration — names only

Adapter:
- DEFAULT_CUSTOMER_ID
- META_ACCESS_TOKEN (secret)
- META_API_VERSION / META_GRAPH_VERSION = v26.0
- META_APP_SECRET (secret)
- META_PHONE_NUMBER_ID
- META_VERIFY_TOKEN (secret)
- PUBLIC_BASE_URL
- RUNTIME_API_TOKEN (secret)
- TENANT_ID
- EMP001_RUNTIME service binding
- SESSIONS KV
- WHATSAPP_INBOUND_QUEUE

Runtime:
- OPENAI_API_KEY (secret)
- RUNTIME_API_TOKEN (secret)
- SALES_OPS_TOKEN (secret)
- AI_ROUTER_TOKEN (must be secret)
- AI_ROUTER service binding
- SALES_OPS service binding
- EMP001_SESSIONS Durable Object

Sales Ops:
- EMP001_API_TOKEN (secret)
- TENANT_ID
- DB D1 binding

AI Router:
- ROUTER_API_TOKEN (secret)
- AI Workers AI binding

## Security gate before SELLABLE

A prior screenshot exposed AI_ROUTER_TOKEN while it was configured as a plain runtime variable. Treat that credential as compromised:
1. rotate the shared credential coherently on AI Router and EMP-001 Runtime;
2. store the runtime-side AI_ROUTER_TOKEN as a Cloudflare Secret;
3. never paste the value into chat, source control, logs or documentation;
4. rerun one real WhatsApp E2E after rotation.

## Remaining release gates

Before marking SELLABLE:
- remove obsolete EMP-002 routing code from the EMP-001 adapter source and preserve/recover that source under version control;
- rotate the exposed AI Router credential and verify E2E after rotation;
- verify payment methods offered by the sales agent are tenant-configured rather than inferred;
- capture concrete idempotency/persistence evidence (duplicate Meta message ID must not cause duplicate processing/outbound);
- confirm tenant isolation evidence and resolve/document the intentional tenant mapping if different component tenant identifiers remain;
- retain correlation/audit evidence sufficient for production troubleshooting.

## Recovery rules

- Do not rebuild historical Workers while the deployed Workers remain recoverable.
- Do not edit EMP-002, CRM, AG-002 or EMP-003 as part of EMP-001 closeout.
- Never claim SELLABLE from CI/deploy alone; require real WhatsApp E2E evidence.
- Meta OAuth code 190 is an authentication failure: rotate/repair the Meta credential rather than modifying sales logic.
- Subrequest-depth failures require checking Worker-to-Worker recursion before rotating unrelated credentials.
