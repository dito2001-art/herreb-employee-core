import {
  reduceAutonomousScheduling,
  type AutonomousSchedulingResult,
  type AutonomousSchedulingState,
} from './emp002-autonomous-scheduling';
import type { WaitlistRequest } from './emp002-scheduling';
import { classifyExternalSchedulingReply } from './emp002-whatsapp-scheduling';

export interface InboundWhatsAppMessage {
  tenantId: string;
  from: string;
  body: string;
  receivedAt: string;
  messageId: string;
}

export interface ActiveSchedulingConversation {
  tenantId: string;
  contactId: string;
  whatsapp: string;
  state: AutonomousSchedulingState;
  requests: WaitlistRequest[];
}

export type InboundSchedulingResolution =
  | { handled: false; reason: 'NO_ACTIVE_OFFER' | 'UNRECOGNIZED_REPLY' }
  | {
      handled: true;
      contactId: string;
      providerMessageId: string;
      response: 'ACCEPT' | 'DECLINE';
      result: AutonomousSchedulingResult;
    };

export function normalizeInboundWhatsAppNumber(value: string): string {
  return String(value || '').trim().replace(/^whatsapp:/i, '').replace(/[^\d]/g, '');
}

export function resolveInboundSchedulingReply(
  message: InboundWhatsAppMessage,
  conversations: ActiveSchedulingConversation[],
): InboundSchedulingResolution {
  const from = normalizeInboundWhatsAppNumber(message.from);
  const active = conversations.find((conversation) =>
    conversation.tenantId === message.tenantId &&
    normalizeInboundWhatsAppNumber(conversation.whatsapp) === from &&
    conversation.state.recovery?.status === 'OFFER_PENDING'
  );

  if (!active) return { handled: false, reason: 'NO_ACTIVE_OFFER' };

  const response = classifyExternalSchedulingReply(message.body);
  if (response === 'UNKNOWN') {
    return { handled: false, reason: 'UNRECOGNIZED_REPLY' };
  }

  const result = reduceAutonomousScheduling(
    active.state,
    response === 'ACCEPT'
      ? { type: 'CONTACT_ACCEPTED', requests: active.requests, now: message.receivedAt }
      : { type: 'CONTACT_DECLINED', requests: active.requests, now: message.receivedAt },
  );

  return {
    handled: true,
    contactId: active.contactId,
    providerMessageId: message.messageId,
    response,
    result,
  };
}
