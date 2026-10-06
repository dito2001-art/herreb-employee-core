export type WorkforceEmployeeId = 'EMP-001' | 'EMP-002' | 'EMP-003';

export interface WorkforceWhatsAppRoute {
  employeeId: WorkforceEmployeeId;
  body: string;
  explicit: boolean;
}

const PREFIX = /^\s*(?:@)?(emp[-_\s]?00([123]))\b\s*[:,-]?\s*/i;

export function routeWorkforceWhatsAppMessage(body: string): WorkforceWhatsAppRoute {
  const text = String(body ?? '');
  const match = text.match(PREFIX);
  if (match) {
    const employeeId = `EMP-00${match[2]}` as WorkforceEmployeeId;
    return { employeeId, body: text.slice(match[0].length).trim() || text.trim(), explicit: true };
  }
  // V1 safe default preserves the currently proven sales entry path.
  // EMP-002/003 are selected explicitly until per-user active-employee context is persisted.
  return { employeeId: 'EMP-001', body: text, explicit: false };
}
