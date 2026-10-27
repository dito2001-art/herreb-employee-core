# Sales Ops authority candidate — NOT DEPLOYED

`worker.js` is derived from the read-only Cloudflare editor source of `herreb-emp001-sales-ops-sandbox`, version `3cddbd33`, inspected 2026-10-27. This repository now tracks the candidate source; the live Worker was not changed.

Order creation requires stable `operation_id`. `order_create_operations` provides tenant/operation and tenant/quote uniqueness in the same D1 batch as order, lines, inventory and audit. Replay reconciles by the same operation before checking quote state. Line insertion stock guards abort the whole transaction. Independent GET remains `/api/v1/orders/:id`. The Core adapter derives a stable tenant/quote operation key and maps the actual `price_gs` and `stock_qty` fields.

Authentication must resolve a token to one tenant through `SALES_OPS_CREDENTIALS_JSON` (array of `{token,tenantId}`), or explicitly bound legacy `EMP001_API_TOKEN` + `EMP001_API_TOKEN_TENANT_ID`. Missing binding, duplicate credential, forged tenant or demo fallback is denied. Demo reset is disabled. Never place credential values in Git, Issues or logs.

Migration `0001_order_create_operations.sql` is a candidate only, for an approved isolated copy of the existing schema. It backfills old quote/order associations and intentionally fails on duplicate quotes. Inspect duplicate/empty quote IDs and preserve a database backup before authorization. No DDL was run against Cloudflare. Do not apply to production under this PR.

Local verification uses the actual worker handlers with Node SQLite and a D1 interface adapter, covering duplicate/concurrent calls, competing keys, scope, inventory rollback and replay after a lost response. It is not real D1/Meta certification. Require independent WF-01/WF-04 review, an isolated D1/Worker manifest with no public routes/previews, exact version read-back and real concurrency/WhatsApp E2E before release. Initial migration recovery is preserve data + reviewed forward-fix; no tested rollback is claimed.
