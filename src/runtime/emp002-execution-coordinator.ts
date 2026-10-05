import type { CalendarInput, CalendarTransport } from '../adapters/calendar';
import type { CrmTransport } from '../adapters/crm';

export interface EMP002ExecutionRequest {
  tenantId: string;
  request: Extract<CalendarInput, { operation: 'create' | 'update' | 'delete' }>;
  idempotencyKey: string;
  correlationId: string;
}

export type EMP002ExecutionResult =
  | { ok: true; status: 'PERSISTED'; recordId: string; record: Record<string, unknown>; writeEvidence?: Record<string, unknown>; readEvidence?: Record<string, unknown> }
  | { ok: false; status: 'WRITE_FAILED' | 'PERSISTENCE_NOT_CONFIRMED' | 'READBACK_FAILED' | 'READBACK_MISMATCH'; error: string };

function outputObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export async function executeEMP002PersistedMutation(
  calendar: CalendarTransport,
  readCrm: CrmTransport,
  input: EMP002ExecutionRequest,
): Promise<EMP002ExecutionResult> {
  const write = await calendar.execute({
    tenantId: input.tenantId,
    request: input.request,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
  });
  if (!write.ok) return { ok: false, status: 'WRITE_FAILED', error: write.error?.code ?? 'EMP002_WRITE_FAILED' };

  const output = outputObject(write.output);
  if (output.persistenceConfirmed !== true) return { ok: false, status: 'PERSISTENCE_NOT_CONFIRMED', error: 'EMP002_PERSISTENCE_NOT_CONFIRMED' };
  const data = outputObject(output.data);
  const recordId = typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : '';
  if (!recordId) return { ok: false, status: 'PERSISTENCE_NOT_CONFIRMED', error: 'EMP002_PERSISTED_RECORD_ID_MISSING' };

  const read = await readCrm.execute({
    tenantId: input.tenantId,
    operation: 'read',
    entity: 'tasks',
    payload: { id: recordId },
    correlationId: `${input.correlationId}:readback`,
  });
  if (!read.ok) return { ok: false, status: 'READBACK_FAILED', error: read.error?.code ?? 'EMP002_READBACK_FAILED' };

  const readOutput = outputObject(read.output);
  const records = Array.isArray(readOutput.data) ? readOutput.data : [];
  const record = records.find((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).id) === recordId) as Record<string, unknown> | undefined;
  if (!record || record.persistenceConfirmed !== true) return { ok: false, status: 'READBACK_MISMATCH', error: 'EMP002_READBACK_NOT_PERSISTED' };

  return {
    ok: true,
    status: 'PERSISTED',
    recordId,
    record,
    writeEvidence: write.evidence,
    readEvidence: read.evidence,
  };
}
