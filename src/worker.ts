import employeeServer from './server';
import { extractMetaTextMessages, handleMetaWhatsAppWebhook } from './runtime';
import { routeWorkforceWhatsAppMessage } from './runtime/workforce-whatsapp-router';
import { dispatchEMP002ScheduledActions } from './runtime/emp002-scheduler-dispatcher';
import { runEMP002LifecycleE2EHarness } from './runtime/emp002-lifecycle-e2e-harness';
import { runEMP002CalendarProductionCertification } from './runtime/emp002-calendar-production-certification';
import { createWaitlistGoal } from './runtime/emp002-cognitive-scheduling';
import { reduceAutonomousScheduling } from './runtime/emp002-autonomous-scheduling';

interface OperationsNamespace { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): DurableObjectStub; }
interface ServiceFetcher { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>; }
type WorkforceAdminResolvedActor = { email?: string; actorId: string; tenantId: string; role: 'owner' | 'user' };
type EMP002E2ERequest = { tenantId?: string; whatsapp?: string; appointmentId?: string; now?: string; startsAt?: string };
type EMP002CalendarCertRequest = { tenantId?: string; correlationId?: string; idempotencyKey?: string; startsAt?: string; endsAt?: string };
type EMP002NorthStarPrepareRequest = { tenantId?: string; whatsapp?: string; contactId?: string; displayName?: string; email?: string; ownerWhatsapp?: string; now?: string; startsAt?: string; endsAt?: string; resourceId?: string };
type WorkerEnv = Env & { AG002_GATEWAY?: ServiceFetcher; RUNTIME_GATEWAY_TOKEN?: string; HERREB_RUNTIME_TOKEN?: string; AG002_TENANT_ID?: string; META_VERIFY_TOKEN?: string; WHATSAPP_TENANT_ROUTES_JSON?: string; EMP002_OPERATIONS?: OperationsNamespace; EMP001_WHATSAPP?: ServiceFetcher; WORKFORCE_ADMIN_STATE?: OperationsNamespace; WORKFORCE_ADMIN_M2M_TOKEN?: string; WORKFORCE_ADMIN_M2M_ACTOR_ID?: string; WORKFORCE_ADMIN_M2M_TENANT_ID?: string; TENANT_MANIFESTS_JSON?: string; ACCESS_IDENTITY_MAP_JSON?: string; };
const WORKFORCE_ADMIN_RUNTIME_MARKER = 'runtime-probe-v1';
function normalizeWhatsAppNumber(value?: string): string { return String(value ?? '').replace(/\D/g, ''); }
function constantTimeEqual(left: string, right: string): boolean { const encoder = new TextEncoder(); const a = encoder.encode(left); const b = encoder.encode(right); const length = Math.max(a.length, b.length); let diff = a.length ^ b.length; for (let index = 0; index < length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0); return diff === 0; }
function configuredAdminIdentities(env: WorkerEnv): WorkforceAdminResolvedActor[] { try { const identities = JSON.parse(env.ACCESS_IDENTITY_MAP_JSON ?? '[]') as Array<{ email?: string; actorId?: string; tenantId?: string; role?: string }>; return identities.flatMap((identity) => { const email = identity.email?.trim().toLowerCase(); const actorId = identity.actorId?.trim(); const tenantId = identity.tenantId?.trim(); const role = identity.role === 'owner' ? 'owner' : identity.role === 'user' ? 'user' : undefined; return actorId && tenantId && role ? [{ email, actorId, tenantId, role }] : []; }); } catch { return []; } }
function isValidM2M(request: Request, env: WorkerEnv): boolean { const expectedToken = env.WORKFORCE_ADMIN_M2M_TOKEN; const suppliedToken = request.headers.get('x-herreb-workforce-admin-token'); return Boolean(expectedToken && suppliedToken && constantTimeEqual(expectedToken, suppliedToken)); }
function resolveWorkforceAdminActor(request: Request, env: WorkerEnv): WorkforceAdminResolvedActor | undefined { const identities = configuredAdminIdentities(env); const accessEmail = request.headers.get('cf-access-authenticated-user-email')?.trim().toLowerCase(); if (accessEmail) return identities.find((identity) => identity.email === accessEmail); if (!isValidM2M(request, env)) return undefined; const configuredActorId = env.WORKFORCE_ADMIN_M2M_ACTOR_ID?.trim(); const configuredTenantId = env.WORKFORCE_ADMIN_M2M_TENANT_ID?.trim(); if (configuredActorId && configuredTenantId) return { actorId: configuredActorId, tenantId: configuredTenantId, role: 'owner' }; const owner = identities.find((identity) => identity.role === 'owner'); if (owner) return owner; const manifests = (() => { try { return JSON.parse(env.TENANT_MANIFESTS_JSON ?? '[]') as Array<{ tenantId?: string }>; } catch { return []; } })(); const tenantId = manifests.find((manifest) => manifest.tenantId?.trim())?.tenantId?.trim(); if (!tenantId) return undefined; return { actorId: 'workforce-admin-m2m', tenantId, role: 'owner' }; }
function resolveTenantOwner(request: Request, env: WorkerEnv, tenantId?: string): WorkforceAdminResolvedActor | undefined { if (!tenantId) return undefined; const actor = resolveWorkforceAdminActor(request, env); if (actor?.tenantId === tenantId && actor.role === 'owner') return actor; return configuredAdminIdentities(env).find((identity) => identity.tenantId === tenantId && identity.role === 'owner'); }
export { ChatAgent } from './server'; export { EMP002Operations } from './runtime/emp002-operations'; export { WorkforceAdminState } from './runtime/workforce-admin-state';
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url); const runtimeEnv = env as WorkerEnv;
    if (url.pathname === '/api/internal/emp002/calendar-certification') {
      if (request.method !== 'POST') return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
      if (!isValidM2M(request, runtimeEnv)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      const body: EMP002CalendarCertRequest = await request.json<EMP002CalendarCertRequest>().catch((): EMP002CalendarCertRequest => ({}));
      const tenantId = body.tenantId?.trim(); const owner = resolveTenantOwner(request, runtimeEnv, tenantId);
      if (!owner || owner.actorId !== 'fernando' || !body.correlationId || !body.idempotencyKey || !body.startsAt || !body.endsAt) return Response.json({ ok: false, error: 'EMP002_CALENDAR_CERT_SCOPE_REJECTED' }, { status: 403 });
      try {
        const result = await runEMP002CalendarProductionCertification(runtimeEnv, { tenantId: owner.tenantId, correlationId: body.correlationId, idempotencyKey: body.idempotencyKey, startsAt: body.startsAt, endsAt: body.endsAt });
        return Response.json(result, { status: result.ok ? 200 : 503 });
      } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : 'EMP002_CALENDAR_CERT_FAILED' }, { status: 503 }); }
    }
    if (url.pathname === '/api/internal/emp002/north-star/prepare') {
      if (request.method !== 'POST') return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
      if (!isValidM2M(request, runtimeEnv)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      if (!runtimeEnv.EMP002_OPERATIONS) return Response.json({ ok: false, error: 'EMP002_OPERATIONS_BINDING_MISSING' }, { status: 503 });
      const body: EMP002NorthStarPrepareRequest = await request.json<EMP002NorthStarPrepareRequest>().catch((): EMP002NorthStarPrepareRequest => ({}));
      const tenantId = body.tenantId?.trim(); const whatsapp = normalizeWhatsAppNumber(body.whatsapp); const owner = resolveTenantOwner(request, runtimeEnv, tenantId);
      if (!owner || owner.actorId !== 'fernando' || !whatsapp || !body.contactId || !body.now || !body.startsAt || !body.endsAt) return Response.json({ ok: false, error: 'EMP002_NORTH_STAR_SCOPE_REJECTED' }, { status: 403 });
      const correlationId = `north-star:${body.contactId}:${body.startsAt}`;
      const goal = createWaitlistGoal({ id: `north-star-${body.contactId}`, tenantId: owner.tenantId, contactId: body.contactId, objective: 'Certify EMP-002 North Star scheduling', resourceId: body.resourceId ?? 'north-star-resource', dateFrom: body.startsAt, dateTo: body.startsAt, durationMinutes: Math.max(1, Math.round((Date.parse(body.endsAt) - Date.parse(body.startsAt)) / 60000)), expiresAt: new Date(Date.parse(body.now) + 60 * 60_000).toISOString(), now: body.now, correlationId });
      const matched = reduceAutonomousScheduling({ tenantId: owner.tenantId, correlationId, goal: { ...goal, status: 'ACTIVE' } }, { type: 'SLOT_RELEASED', slot: { tenantId: owner.tenantId, resourceId: body.resourceId ?? 'north-star-resource', startsAt: body.startsAt, endsAt: body.endsAt }, requests: [goal.waitlist!], now: body.now });
      const waiting = reduceAutonomousScheduling(matched.state, { type: 'OFFER_SENT', now: body.now });
      const record = { tenantId: owner.tenantId, contactId: body.contactId, whatsapp, displayName: body.displayName, email: body.email, ownerWhatsapp: normalizeWhatsAppNumber(body.ownerWhatsapp), timezone: 'America/Asuncion', state: waiting.state, requests: [goal.waitlist!] };
      const id = runtimeEnv.EMP002_OPERATIONS.idFromName(`tenant:${owner.tenantId}`); const stub = runtimeEnv.EMP002_OPERATIONS.get(id);
      const saved = await stub.fetch('https://emp002.operations/dispatch/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(record) });
      if (!saved.ok) return Response.json({ ok: false, error: 'EMP002_NORTH_STAR_PREPARE_FAILED', upstreamStatus: saved.status }, { status: 503 });
      return Response.json({ ok: true, prepared: true, tenantId: owner.tenantId, correlationId, contactId: body.contactId, whatsapp, startsAt: body.startsAt, endsAt: body.endsAt, state: waiting.state.goal.status, recoveryStatus: waiting.state.recovery?.status });
    }
    if (url.pathname === '/api/internal/emp002/north-star/readback') {
      if (request.method !== 'POST') return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
      if (!isValidM2M(request, runtimeEnv)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      if (!runtimeEnv.EMP002_OPERATIONS) return Response.json({ ok: false, error: 'EMP002_OPERATIONS_BINDING_MISSING' }, { status: 503 });
      const body = await request.json<{ tenantId?: string; whatsapp?: string }>().catch(() => ({}));
      const tenantId = body.tenantId?.trim(); const whatsapp = normalizeWhatsAppNumber(body.whatsapp); const owner = resolveTenantOwner(request, runtimeEnv, tenantId);
      if (!owner || owner.actorId !== 'fernando' || !whatsapp) return Response.json({ ok: false, error: 'EMP002_NORTH_STAR_SCOPE_REJECTED' }, { status: 403 });
      const id = runtimeEnv.EMP002_OPERATIONS.idFromName(`tenant:${owner.tenantId}`); const stub = runtimeEnv.EMP002_OPERATIONS.get(id);
      const lookup = await stub.fetch('https://emp002.operations/dispatch/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: owner.tenantId, whatsapp }) });
      const result = await lookup.json<{ ok?: boolean; record?: { tenantId?: string; contactId?: string; whatsapp?: string; state?: { goal?: { status?: string }; recovery?: { status?: string } } } | null }>().catch(() => ({}));
      if (!lookup.ok || !result.ok) return Response.json({ ok: false, error: 'EMP002_NORTH_STAR_READBACK_FAILED', upstreamStatus: lookup.status }, { status: 503 });
      const record = result.record ?? null;
      return Response.json({ ok: true, found: Boolean(record), tenantId: owner.tenantId, whatsapp, contactId: record?.contactId ?? null, recordTenantId: record?.tenantId ?? null, recordWhatsapp: record?.whatsapp ?? null, state: record?.state?.goal?.status ?? null, recoveryStatus: record?.state?.recovery?.status ?? null });
    }
    if (url.pathname === '/api/internal/emp002/e2e') {
      if (request.method !== 'POST') return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'POST' } });
      if (!isValidM2M(request, runtimeEnv)) return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
      if (!runtimeEnv.EMP002_OPERATIONS) return Response.json({ ok: false, error: 'EMP002_OPERATIONS_BINDING_MISSING' }, { status: 503 });
      const body: EMP002E2ERequest = await request.json<EMP002E2ERequest>().catch((): EMP002E2ERequest => ({}));
      const tenantId = body.tenantId?.trim(); const whatsapp = normalizeWhatsAppNumber(body.whatsapp); const owner = resolveTenantOwner(request, runtimeEnv, tenantId);
      if (!owner || !whatsapp || owner.actorId !== 'fernando') return Response.json({ ok: false, error: 'EMP002_E2E_SCOPE_REJECTED' }, { status: 403 });
      if (!body.appointmentId || !body.now || !body.startsAt) return Response.json({ ok: false, error: 'EMP002_E2E_INPUT_REQUIRED' }, { status: 400 });
      try { const result = await runEMP002LifecycleE2EHarness(runtimeEnv.EMP002_OPERATIONS, { tenantId: owner.tenantId, whatsapp, appointmentId: body.appointmentId, now: body.now, startsAt: body.startsAt }); return Response.json(result); } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : 'EMP002_E2E_FAILED' }, { status: 503 }); }
    }
    if (url.pathname === '/api/admin/workforce') {
      if (!runtimeEnv.WORKFORCE_ADMIN_STATE) return Response.json({ ok: false, error: 'WORKFORCE_ADMIN_STATE_BINDING_MISSING' }, { status: 503 });
      const id = runtimeEnv.WORKFORCE_ADMIN_STATE.idFromName('global'); const stub = runtimeEnv.WORKFORCE_ADMIN_STATE.get(id);
      if (request.method === 'GET') return stub.fetch('https://workforce.admin/state', { method: 'GET' });
      if (request.method === 'POST') { const m2mAuthenticated = isValidM2M(request, runtimeEnv); const actor = resolveWorkforceAdminActor(request, runtimeEnv); const headers = new Headers({ 'content-type': request.headers.get('content-type') ?? 'application/json' }); if (actor) { if (actor.email) headers.set('cf-access-authenticated-user-email', actor.email); headers.set('x-herreb-internal-actor-id', actor.actorId); headers.set('x-herreb-internal-tenant-id', actor.tenantId); headers.set('x-herreb-internal-role', actor.role); } const response = await stub.fetch('https://workforce.admin/mutate', { method: 'POST', headers, body: request.body }); const responseHeaders = new Headers(response.headers); responseHeaders.set('x-herreb-runtime-marker', WORKFORCE_ADMIN_RUNTIME_MARKER); responseHeaders.set('x-herreb-m2m-authenticated', String(m2mAuthenticated)); responseHeaders.set('x-herreb-actor-resolved', String(Boolean(actor))); responseHeaders.set('x-herreb-internal-context-sent', String(Boolean(actor))); return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders }); }
      return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { allow: 'GET, POST' } });
    }
    if (url.pathname === '/webhooks/meta/whatsapp') {
      if (request.method === 'GET') return handleMetaWhatsAppWebhook(request, runtimeEnv, async () => undefined);
      if (request.method === 'POST') { const payload = await request.clone().json().catch(() => undefined); const inbound = extractMetaTextMessages(payload); if (inbound.length) { const route = routeWorkforceWhatsAppMessage(inbound[0].body); if (route.employeeId === 'EMP-001' && runtimeEnv.EMP001_WHATSAPP) return runtimeEnv.EMP001_WHATSAPP.fetch('https://emp001.internal/webhooks/meta/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); if (route.employeeId === 'EMP-003') return Response.json({ ok: false, error: 'EMP003_WHATSAPP_NOT_READY' }, { status: 503 }); } }
      return handleMetaWhatsAppWebhook(request, runtimeEnv, async (message) => { const route = routeWorkforceWhatsAppMessage(message.body); if (route.employeeId !== 'EMP-002') return; message.body = route.body; if (!runtimeEnv.EMP002_OPERATIONS) throw new Error('EMP002_OPERATIONS_BINDING_MISSING'); const id = runtimeEnv.EMP002_OPERATIONS.idFromName(`tenant:${message.tenantId}`); const stub = runtimeEnv.EMP002_OPERATIONS.get(id); console.log(JSON.stringify({ event: 'EMP002_WHATSAPP_DISPATCH_START', tenantId: message.tenantId, messageId: message.messageId, routedEmployee: route.employeeId })); const response = await stub.fetch('https://emp002.operations/inbound/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message) }); const responseText = await response.text(); console.log(JSON.stringify({ event: 'EMP002_WHATSAPP_DISPATCH_RESPONSE', tenantId: message.tenantId, messageId: message.messageId, status: response.status, ok: response.ok, responsePreview: responseText.slice(0, 500) })); if (!response.ok) throw new Error(`EMP002_OPERATIONS_DISPATCH_FAILED:${response.status}:${responseText}`); });
    }
    return employeeServer.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> { const runtimeEnv = env as WorkerEnv; ctx.waitUntil((async () => { const results = await dispatchEMP002ScheduledActions(runtimeEnv, new Date(controller.scheduledTime).toISOString()); console.log(JSON.stringify({ event: 'EMP002_SCHEDULER_RUN', scheduledTime: controller.scheduledTime, tenants: results.length, results })); })()); },
};
