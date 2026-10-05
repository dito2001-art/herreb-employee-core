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

async function post(stub: DurableObjectStub, path: string, body: unknown): Promise<{ status: number; body: any }> {
  const response = await stub.fetch(`https://emp002.operations${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = text;
  try { parsed = text ? JSON.parse(text) : undefined; } catch { /* keep text */ }
  return { status: response.status, body: parsed };
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
  if (execute.status !== 200 || execute.body?.executed !== 1 || !execute.body?.results?.[0]?.providerMessageId) {
    throw new Error(`EMP002_E2E_EXECUTION_EVIDENCE_FAILED:${execute.status}`);
  }

  const dedupe = await post(stub, '/appointment/actions/execute', { tenantId: input.tenantId, now: input.now, limit: 1 });
  if (dedupe.status !== 200 || dedupe.body?.executed !== 0 || dedupe.body?.prepared !== 0) {
    throw new Error(`EMP002_E2E_DEDUPLICATION_FAILED:${dedupe.status}`);
  }

  return {
    ok: true,
    tenantId: input.tenantId,
    appointmentId: input.appointmentId,
    actionKey,
    providerMessageId: execute.body.results[0].providerMessageId as string,
    firstExecution: execute.body,
    secondExecution: dedupe.body,
  };
}
