import { createCalendarControlledWriteTransport } from '../adapters/controlled-write-http';
import type { ServiceFetcher } from '../adapters/sales-ops';
import { MetaWhatsAppTransport } from '../adapters/whatsapp-meta';

export interface EMP002WorkersAI {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface EMP002OperationsTransportEnv {
  AI?: EMP002WorkersAI;
  AG002_GATEWAY?: ServiceFetcher;
  RUNTIME_GATEWAY_TOKEN?: string;
  AG002_TENANT_ID?: string;
  META_ACCESS_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  META_GRAPH_VERSION?: string;
  META_API_VERSION?: string;
}

function assertTenantScope(env: EMP002OperationsTransportEnv, tenantId: string): string {
  const scopedTenant = env.AG002_TENANT_ID?.trim();
  if (!scopedTenant || scopedTenant !== tenantId) throw new Error('EMP002_OPERATIONS_TENANT_SCOPE_MISMATCH');
  return scopedTenant;
}

/** WhatsApp-only transport for general EMP-002 conversations. */
export function buildEMP002WhatsAppTransport(env: EMP002OperationsTransportEnv, tenantId: string) {
  assertTenantScope(env, tenantId);
  if (!env.META_ACCESS_TOKEN?.trim() || !env.META_PHONE_NUMBER_ID?.trim()) {
    throw new Error('EMP002_WHATSAPP_TRANSPORT_MISSING');
  }
  return new MetaWhatsAppTransport(env);
}

/** Calendar controlled-write transport used only by scheduling flows. */
export function buildEMP002CalendarTransport(env: EMP002OperationsTransportEnv, tenantId: string) {
  const scopedTenant = assertTenantScope(env, tenantId);
  if (!env.AG002_GATEWAY || !env.RUNTIME_GATEWAY_TOKEN?.trim()) {
    throw new Error('EMP002_CALENDAR_WRITE_TRANSPORT_MISSING');
  }
  return createCalendarControlledWriteTransport({
    service: env.AG002_GATEWAY,
    token: env.RUNTIME_GATEWAY_TOKEN,
    tenantId: scopedTenant,
    baseUrl: 'https://internal',
  });
}

/** Backward-compatible combined transport factory for scheduling. */
export function buildEMP002OperationsTransports(env: EMP002OperationsTransportEnv, tenantId: string) {
  return {
    calendar: buildEMP002CalendarTransport(env, tenantId),
    whatsapp: buildEMP002WhatsAppTransport(env, tenantId),
  };
}
