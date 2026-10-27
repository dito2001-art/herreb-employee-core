# WF-00 | EMP-003 dedicated staging Worker — operator preflight (NO-GO)

**Source:** PR #295 HEAD `e6b2f8ffaa1386a638b82a6d587f7e9e1acd9dc9`. This file is a **review-only** procedure. No command in the active section deploys, uploads, creates resources, changes secrets, DNS, Access, or DO migrations. No Cloudflare credential is needed for the local preflight.

## Fixed boundaries

- Target is **new** `herreb-emp003-staging`, never `herreb-workforce-staging-gateway` (existing Hello World version `8df0e463-5138-4d08-ab1b-8e7fe7ea2e81`, no bindings).
- Candidate manifest: `deploy/staging/wrangler.emp003.jsonc`; ingress: `src/staging/emp003-entry.ts`. This branch changes documentation only.
- `workers_dev=false`, **no routes/custom domain/cron/queue consumer**. Never use production Access audience, identity map, CRM, Meta, Sales Ops, DO namespace or service bindings.
- **NO MERGE, DEPLOY, VERSIONS UPLOAD, MIGRATION, SECRET UPDATE, ACCESS POLICY CHANGE OR ROUTE CHANGE** before dual formal GO and separate owner authorization.

## Exact local, read-only commands (repository root)

```bash
# Clone if needed, then work on the exact reviewed source; do not use main implicitly.
git fetch origin
git checkout --detach e6b2f8ffaa1386a638b82a6d587f7e9e1acd9dc9
test "$(git rev-parse HEAD)" = "e6b2f8ffaa1386a638b82a6d587f7e9e1acd9dc9" || exit 1
npm ci
node -e 'const fs=require("fs"),p="deploy/staging/wrangler.emp003.jsonc",c=JSON.parse(fs.readFileSync(p,"utf8"));if(c.name!=="herreb-emp003-staging"||c.main!=="../../src/staging/emp003-entry.ts"||c.workers_dev!==false||c.routes||c.route||c.triggers||c.queues||c.assets?.run_worker_first!==true)process.exit(1);console.log("manifest static guard PASS")'
test -f src/staging/emp003-entry.ts
test -f deploy/staging/wrangler.emp003.jsonc
CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH=deploy/staging/wrangler.emp003.jsonc npm run build:console
test -f dist/client/index.html
# Vite generates a deploy config; verify it before any Wrangler invocation.
test -f .wrangler/deploy/config.json
node --input-type=module -e '
import fs from "node:fs"; import path from "node:path";
const redirect=JSON.parse(fs.readFileSync(".wrangler/deploy/config.json","utf8"));
const file=path.resolve(".wrangler/deploy",redirect.configPath);
const cfg=JSON.parse(fs.readFileSync(file,"utf8"));
if(cfg.name!=="herreb-emp003-staging"||cfg.workers_dev!==false||cfg.routes||cfg.route||cfg.assets?.run_worker_first!==true)throw Error("Unsafe generated config");
const d1=cfg.d1_databases?.find(x=>x.binding==="DB");
const kv=cfg.kv_namespaces?.find(x=>x.binding==="STAGING_KV");
const dob=cfg.durable_objects?.bindings?.find(x=>x.name==="EMP003_CAMPAIGN_STATE"&&x.class_name==="EMP003CampaignState");
if(d1?.database_id!=="488f4829-bee4-4e0a-8ecd-bd4a1ced71b4"||kv?.id!=="0c24a032442d47adb30dfc8dbf72b010"||!dob)throw Error("Wrong staging bindings");
console.log("Generated config PASS:",file,"main:",cfg.main);
'
# Only after inspecting the generated manifest: dry-run the generated Vite output.
npx wrangler deploy --dry-run --outdir /tmp/wf00-emp003-staging-dryrun
```

**Confirmed P0 build selection:** `vite.config.ts` invokes `cloudflare()` with no `configPath`. Per Cloudflare Vite plugin API, `CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH` selects the entry Wrangler config ahead of the root fallback. The command above sets it for this process only. Confirm the generated Vite output configuration names `herreb-emp003-staging` and points to `src/staging/emp003-entry.ts` (or its built entry), with staging-only bindings and assets; fail closed on mismatch. Wrangler may follow Vite's `.wrangler/deploy/config.json` redirect; validate its generated target explicitly. The old command using `--config deploy/staging/wrangler.emp003.jsonc` could inadvertently rebuild or validate the source rather than the generated bundle and is replaced above. Review any Vite-generated output manifest before considering deployment. Source: https://developers.cloudflare.com/workers/vite-plugin/reference/api/ . Do **not** replace `--dry-run` with a normal deploy.

## Candidate manifest inventory — verify against Cloudflare before GO

| Component | Expected |
| --- | --- |
| Worker name | `herreb-emp003-staging` |
| Entry | `../../src/staging/emp003-entry.ts` |
| Static assets | `../../dist/client`, `ASSETS`, `run_worker_first=true` |
| D1 | `DB` -> `herreb-workforce-staging-db` / `488f4829-bee4-4e0a-8ecd-bd4a1ced71b4` |
| KV | `STAGING_KV` -> `0c24a032442d47adb30dfc8dbf72b010` |
| DO | `ChatAgent`, `EMP002Operations`, `WorkforceAdminState`, `EMP003CampaignState` local to the **new Worker** |
| DO legacy migration tags | `v1`–`v4`, new SQLite classes; **not applied** by this procedure |
| Additional bindings | `AI` (remote), `BROWSER`; review whether both are necessary for staging |
| Deliberately absent | Meta, CRM, Sales Ops, Queue, service bindings, routes, cron, Access credentials |

### Migration decision

WF-01 must verify the new Worker has no existing DO class/namespace collision and review v1–v4 applicability, retention, backup/recovery and migration semantics. Cloudflare's current configuration guidance prefers declarative `exports` for new Workers, while this candidate uses legacy `migrations`; **do not switch format automatically** without compatibility review. A code rollback does not reverse a DO schema change. No migration is authorized here.

### Dedicated Access preflight (no change to HerreB Owner)

WF-01 must obtain and privately verify **separate** staging Access application, dedicated hostname, issuer/team domain, audience, two independently authorized A/B identities and tenant mapping. Runtime expects `EMP003_STAGING_ACCESS_TEAM_DOMAIN`, `EMP003_STAGING_ACCESS_AUDIENCE`, `EMP003_STAGING_IDENTITY_MAP_JSON` (protected configuration; never paste tokens or identity details into GitHub). Fail closed when missing. Prove signature/JWKS, issuer, audience, expiration, actor role and tenant scoping; test wrong-tenant JWT, unauthenticated request, static assets, preview paths, direct Worker bypass, internal M2M routes, WebSocket upgrade and missing config. Current staging entry allows only authenticated GET `/api/emp003/operations`, GET/HEAD `/`, `/index.html`, `/assets/*`, and POST `/api/emp003/drafts`. No broader E2E claim is valid until actual browser flow matches this allowlist.

### WF-01 / WF-04 sign-off matrix

| Gate | Owner | Required proof | Current result |
| --- | --- | --- | --- |
| Source and build | WF-04 | exact SHA, `npm ci`, console build, dedicated-config dry-run, exports, asset manifest | BLOCKED pending independent replay |
| Isolation | WF-01 | actual Cloudflare D1/KV/DO/bindings readback, no production resources or routes | BLOCKED |
| Access | WF-01 | separate app/audience/hostname, A/B JWT positive and negative real tests | BLOCKED |
| Publication control | WF-01 | Git integration, Builds, deploy hooks, Wrangler/API tokens, ruleset, no automatic publication | BLOCKED |
| M2M CAS | WF-04 | authoritative caller inventory; `createOnly` / `expectedRevision`, stale 409, independent GET, tenant checks | BLOCKED |
| Functional E2E | WF-04 | A/B create/edit/save/reload/GET, immutable APPROVED, readback-failure, no publication | BLOCKED |
| Recovery | WF-01 + WF-04 | initial-deploy disable-route plan, known-good SHA, DO forward recovery, accountable operator | BLOCKED |
| Authorization | WF-01 + WF-04 + owner | formal GO by exact SHA and environment, then explicit owner deploy authorization | NO-GO |

**Known P0:** `src/worker.ts` legacy M2M POST `/api/internal/emp003/drafts` does not forward `createOnly`/`expectedRevision`; DO permits unconditional legacy DRAFT write. Do not enforce CAS blindly until actual callers are identified; browser BFF uses CAS already. This is not a staging deployment authorization.

## AFTER GO ONLY — operator handoff, not an executable command

1. Approve exact reviewed SHA, separate Access/hostname and identity mapping, isolation and first-deploy DO migration plan.
2. Obtain dual written WF-01 SECURITY GO / WF-04 RELEASE GO and explicit owner approval.
3. Have authorized operator execute a **separately reviewed** first-deploy command for the dedicated config; capture Cloudflare version ID, DO migrations and bindings readback.
4. Keep external routes disabled until Access and bypass checks are satisfied; then authorize one isolated real A/B E2E session.
5. On initial-deploy failure, disable staging route/Access and retain isolated state; no previous staging app version exists for rollback.

**Status:** PREPARED / SECURITY NO-GO / RELEASE NO-GO. Never treat local dry-run as real Access E2E or staging deployment.
