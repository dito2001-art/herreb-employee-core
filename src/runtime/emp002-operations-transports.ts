import { createAg002GatewayControlledWriteTransport, createAg002GatewayReadOnlyTransport } from '../adapters/ag002-gateway';
import { createCrmCalendarControlledWriteTransport } from '../adapters/crm-calendar-write';
import type { CalendarTransport } from '../adapters/calendar';
import type { ServiceFetcher } from '../adapters/sales-ops';
import { MetaWhatsAppTransport } from '../adapters/whatsapp-meta';

export interface EMP002WorkersAI {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface EMP002OperationsTransportEnv {
  AI?: EMP002WorkersAI;
  AG002_GATEWAY?: ServiceFetcher;
  CALENDAR_READ?: ServiceFetcher;
  RUNTIME_GATEWAY_TOKEN?: string;
  CALENDAR_READ_TOKEN?: string;
  AG002_TENANT_ID?: string;
  CALENDAR_TENANT_ID?: string;
  EMP002_OWNER_WHATSAPP?: string;
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

function crmDate(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error('EMP002_INVALID_CALENDAR_DATE');
  return match[1];
}

/** WhatsApp-only transport for general EMP-002 conversations. */
export function buildEMP002WhatsAppTransport(env: EMP002OperationsTransportEnv, tenantId: string) {
  assertTenantScope(env, tenantId);
  if (!env.META_ACCESS_TOKEN?.trim() || !env.META_PHONE_NUMBER_ID?.trim()) {
    throw new Error('EMP002_WHATSAPP_TRANSPORT_MISSING');
  }
  return new MetaWhatsAppTransport(env);
}

/**
 * Calendar READ_ONLY capability backed by the HerreB CRM.
 * EMP-002 deliberately does not read Google Calendar directly: the CRM is the
 * operational system of record and owns any downstream calendar sync.
 */
export function buildEMP002CalendarReadTransport(env: EMP002OperationsTransportEnv, tenantId: string): CalendarTransport {
  const scopedTenant = assertTenantScope(env, tenantId);
  if (!env.AG002_GATEWAY || !env.RUNTIME_GATEWAY_TOKEN?.trim()) {
    throw new Error('EMP002_CRM_CALENDAR_READ_TRANSPORT_MISSING');
  }

  const crm = createAg002GatewayReadOnlyTransport({
    service: env.AG002_GATEWAY,
    runtimeToken: env.RUNTIME_GATEWAY_TOKEN,
    tenantId: scopedTenant,
    baseUrl: 'https://internal',
  });

  return {
    async execute(input) {
      const request = input.request;
      if (request.operation !== 'search' && request.operation !== 'availability') {
        return {
          ok: false,
          error: { code: 'CALENDAR_READ_ONLY', message: 'CRM-backed calendar read accepts reads only' },
          evidence: { executed: false, tenantId: input.tenantId, correlationId: input.correlationId, operation: request.operation },
        };
      }

      const from = crmDate(request.timeMin);
      const exclusiveTo = new Date(request.timeMax);
      if (Number.isNaN(exclusiveTo.getTime())) throw new Error('EMP002_INVALID_CALENDAR_DATE');
      exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() - 1);
      const to = exclusiveTo.toISOString().slice(0, 10);

      const result = await crm.execute({
        tenantId: input.tenantId,
        operation: 'read',
        entity: 'tasks',
        payload: { from, to, limit: 100, offset: 0 },
        correlationId: input.correlationId,
      });

      return {
        ...result,
        evidence: {
          ...(result.evidence ?? {}),
          calendarSource: 'HERREB_CRM',
          calendarOperation: request.operation,
          crmDateFrom: from,
          crmDateTo: to,
        },
      };
    },
  };
}

/**
 * Calendar CONTROLLED_WRITE backed by the same tenant-scoped AG-002 CRM gateway.
 * CRM remains the system of record and owns downstream Google Calendar sync.
 */
export function buildEMP002CalendarTransport(env: EMP002OperationsTransportEnv, tenantId: string): CalendarTransport {
  const scopedTenant = assertTenantScope(env, tenantId);
  if (!env.AG002_GATEWAY || !env.RUNTIME_GATEWAY_TOKEN?.trim()) {
    throw new Error('EMP002_CALENDAR_WRITE_TRANSPORT_MISSING');
  }
  const crm = createAg002GatewayControlledWriteTransport({
    service: env.AG002_GATEWAY,
    runtimeToken: env.RUNTIME_GATEWAY_TOKEN,
    tenantId: scopedTenant,
    baseUrl: 'https://internal',
  });
  return createCrmCalendarControlledWriteTransport(crm);
}

/** Backward-compatible combined transport factory for scheduling. */
export function buildEMP002OperationsTransports(env: EMP002OperationsTransportEnv, tenantId: string) {
  return {
    calendar: buildEMP002CalendarTransport(env, tenantId),
    whatsapp: buildEMP002WhatsAppTransport(env, tenantId),
  };
}
