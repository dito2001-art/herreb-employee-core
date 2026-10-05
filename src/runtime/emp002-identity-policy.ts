export type EMP002ActorRole = 'OWNER' | 'TEAM' | 'EXTERNAL_CONTACT' | 'UNKNOWN';
export type EMP002Operation = 'READ_OWNER_AGENDA' | 'CHECK_AVAILABILITY' | 'CREATE_APPOINTMENT' | 'RESCHEDULE_APPOINTMENT' | 'CANCEL_APPOINTMENT' | 'CONFIRM_APPOINTMENT';

export interface EMP002Actor {
  role: EMP002ActorRole;
  contactId?: string;
}

export function authorizeEMP002Operation(actor: EMP002Actor, operation: EMP002Operation): boolean {
  if (actor.role === 'OWNER' || actor.role === 'TEAM') return true;
  if (actor.role !== 'EXTERNAL_CONTACT') return false;

  return operation !== 'READ_OWNER_AGENDA';
}
