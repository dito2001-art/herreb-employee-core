export interface EMP002LifecycleE2ENamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface EMP002LifecycleE2EInput {
  tenantId: string;
  appointmentId: string;
  whatsapp: string;
  now: string;
  startsAt: string;
}

interface ExecutionResult {
  actionKey?: string;
  appointmentId?: string;
  providerMessageId?: string;
  error?: string;
  status?: string;
  provider?: string;
  providerStatus?: number;
  correlationId?: string;
  [key: string]: unknown;
}

interface ExecutionBody {
  executed?: number;
  prepared?: number;
  retryable?: number;
  status?: string;
  results?: ExecutionResult[];
  [key: string]: unknown;
}

async function post(stub: DurableObjectStub, path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await stub.fetch(`https://emp002.operations${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try { parsed = text ? JSON.parse(text) as unknown : undefined; } catch { /* keep text */ }
  return { status: response.status, body: parsed };
}

function executionBody(value: unknown): ExecutionBody {
  return value && typeof value === 'object' ? value as ExecutionBody : {};
}

function safeExecutionEvidence(status: number, body: ExecutionBody): string {
  const first = body.results?.[0];
  return JSON.stringify({
    httpStatus: status,
    status: body.status,
    prepared: body.prepared,
    executed: body.executed,
    retryable: body.retryable,
    resultStatus: first?.status,
    appointmentId: first?.appointmentId,
    actionKey: first?.actionKey,
    provider: first?.provider,
    providerStatus: first?.providerStatus,
    providerMessageIdPresent: Boolean(first?.providerMessageId),
    correlationId: first?.correlationId,
    error: first?.error,
  });
}

export async function runEMP002LifecycleE2EHarness(namespace: EMP002LifecycleE2ENamespace, input: EMP002LifecycleE2EInput) {
  const id = namespace.idFromName(`tenant:${input.tenantId}`);
  const stub = namespace.get(id);
  const actionKey = `e2e:${input.appointmentId}:reminder`;

  const register = await post(stub, '/appointment/register', {
    tenantId: input.tenantId,
    appointmentId: input.appointmentId,
    state: 'CONFIRMED',
    startsAt: input.startsAt,
    updatedAt: input.now,
  });
  if (register.status !== 200) throw new Error(`EMP002_E2E_REGISTER_FAILED:${register.status}`);

  const schedule = await post(stub, '/appointment/actions/schedule', {
    tenantId: input.tenantId,
    appointmentId: input.appointmentId,
    actionKey,
    kind: 'REMINDER',
    dueAt: input.now,
    payload: { whatsapp: input.whatsapp, message: `EMP-002 E2E ${input.appointmentId}` },
  });
  if (schedule.status !== 200) throw new Error(`EMP002_E2E_SCHEDULE_FAILED:${schedule.status}`);

  const execute = await post(stub, '/appointment/actions/execute', { tenantId: input.tenantId, now: input.now, limit: 1 });
  const first = executionBody(execute.body);
  const result = first.results?.[0];
  const providerMessageId = result?.providerMessageId;
  const correlationId = `appointment:${input.appointmentId}:${actionKey}`;
  if (
    execute.status !== 200 ||
    first.executed !== 1 ||
    first.prepared !== 1 ||
    !providerMessageId ||
    result?.appointmentId !== input.appointmentId ||
    result?.actionKey !== actionKey ||
    result?.correlationId !== correlationId ||
    result?.provider !== 'meta-cloud-api' ||
    result?.providerStatus !== 200 ||
    result?.status !== 'EXECUTED'
  ) {
    throw new Error(`EMP002_E2E_EXECUTION_EVIDENCE_FAILED:${safeExecutionEvidence(execute.status, first)}`);
  }

  const dedupe = await post(stub, '/appointment/actions/execute', { tenantId: input.tenantId, now: input.now, limit: 1 });
  const second = executionBody(dedupe.body);
  if (dedupe.status !== 200 || second.executed !== 0 || second.prepared !== 0) {
    throw new Error(`EMP002_E2E_DEDUPLICATION_FAILED:${safeExecutionEvidence(dedupe.status, second)}`);
  }

  return {
    ok: true,
    tenantId: input.tenantId,
    appointmentId: input.appointmentId,
    actionKey,
    correlationId,
    providerMessageId,
    firstExecution: first,
    secondExecution: second,
  };
}
