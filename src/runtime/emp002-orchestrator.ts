import { classifyEMP002SchedulingIntent, type EMP002SchedulingIntent } from './emp002-intent-engine';
import { authorizeEMP002Operation, type EMP002Actor, type EMP002Operation } from './emp002-identity-policy';
import { findEMP002AvailableSlots, type EMP002BusyPeriod, type EMP002SchedulingConfig } from './emp002-scheduling-engine';

export interface EMP002OrchestrationInput {
  tenantId: string;
  actor: EMP002Actor;
  text: string;
  serviceId?: string;
  dayStart?: string;
  busy?: EMP002BusyPeriod[];
  scheduling?: EMP002SchedulingConfig;
}

export type EMP002OrchestrationResult =
  | { status: 'UNKNOWN_INTENT'; intent: 'UNKNOWN' }
  | { status: 'DENIED'; intent: EMP002SchedulingIntent; operation: EMP002Operation }
  | { status: 'NEEDS_CONTEXT'; intent: EMP002SchedulingIntent; missing: string[] }
  | { status: 'AVAILABILITY'; intent: 'CHECK_AVAILABILITY'; slots: ReturnType<typeof findEMP002AvailableSlots> }
  | { status: 'READY_TO_EXECUTE'; intent: Exclude<EMP002SchedulingIntent, 'UNKNOWN' | 'CHECK_AVAILABILITY'>; operation: EMP002Operation };

function operationFor(intent: Exclude<EMP002SchedulingIntent, 'UNKNOWN'>): EMP002Operation {
  return intent;
}

export function orchestrateEMP002(input: EMP002OrchestrationInput): EMP002OrchestrationResult {
  const classified = classifyEMP002SchedulingIntent(input.text);
  if (classified.intent === 'UNKNOWN') return { status: 'UNKNOWN_INTENT', intent: 'UNKNOWN' };

  const operation = operationFor(classified.intent);
  if (!authorizeEMP002Operation(input.actor, operation)) return { status: 'DENIED', intent: classified.intent, operation };

  if (classified.intent === 'CHECK_AVAILABILITY') {
    const missing: string[] = [];
    if (!input.serviceId) missing.push('serviceId');
    if (!input.dayStart) missing.push('dayStart');
    if (!input.scheduling) missing.push('scheduling');
    if (missing.length) return { status: 'NEEDS_CONTEXT', intent: classified.intent, missing };
    if (input.scheduling!.tenantId !== input.tenantId) throw new Error('EMP002_SCHEDULING_TENANT_SCOPE_MISMATCH');
    return {
      status: 'AVAILABILITY',
      intent: classified.intent,
      slots: findEMP002AvailableSlots(input.scheduling!, input.serviceId!, input.dayStart!, input.busy ?? []),
    };
  }

  return { status: 'READY_TO_EXECUTE', intent: classified.intent, operation };
}
