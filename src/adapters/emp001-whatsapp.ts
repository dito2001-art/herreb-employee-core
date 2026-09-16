import type {
  CapabilityAdapter,
  CapabilityRequest,
  CapabilityResult
} from "../core/adapters";

export interface Emp001WhatsAppSendInput {
  leadId: string;
  contactKey: string;
  channel?: string;
  kind?: string;
  text?: string;
}

export interface Emp001WhatsAppSendResult {
  messageId?: string;
  provider?: string;
  status?: string;
}

export interface Emp001WhatsAppPort {
  send(input: {
    tenantId: string;
    correlationId: string;
    idempotencyKey: string;
    leadId: string;
    to: string;
    text?: string;
  }): Promise<CapabilityResult<Emp001WhatsAppSendResult>>;
}

export function createEmp001WhatsAppAdapter(
  port: Emp001WhatsAppPort
): CapabilityAdapter<Emp001WhatsAppSendInput, Emp001WhatsAppSendResult> {
  return {
    id: "emp001-whatsapp",
    capabilities: ["whatsapp.send"],
    employees: ["EMP-001"],
    async execute(
      request: CapabilityRequest<Emp001WhatsAppSendInput>
    ): Promise<CapabilityResult<Emp001WhatsAppSendResult>> {
      if (!request.idempotencyKey?.trim()) {
        return {
          ok: false,
          error: {
            code: "WHATSAPP_IDEMPOTENCY_REQUIRED",
            message: "WhatsApp sends require an idempotency key"
          }
        };
      }
      if (!request.input.contactKey?.trim()) {
        return {
          ok: false,
          error: {
            code: "WHATSAPP_RECIPIENT_REQUIRED",
            message: "WhatsApp recipient is required"
          }
        };
      }
      const result = await port.send({
        tenantId: request.context.tenantId,
        correlationId: request.context.correlationId,
        idempotencyKey: request.idempotencyKey,
        leadId: request.input.leadId,
        to: request.input.contactKey,
        ...(request.input.text ? { text: request.input.text } : {})
      });
      return {
        ...result,
        evidence: {
          ...(result.evidence ?? {}),
          tenantId: request.context.tenantId,
          correlationId: request.context.correlationId,
          idempotencyKey: request.idempotencyKey,
          adapter: "emp001-whatsapp"
        }
      };
    }
  };
}
