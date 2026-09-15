import type {
  CapabilityAdapter,
  CapabilityRequest,
  CapabilityResult
} from "../core";

export type EmailInput =
  | {
      operation: "search";
      query: string;
      maxResults?: number;
    }
  | {
      operation: "read";
      messageId: string;
    }
  | {
      operation: "send";
      to: string[];
      subject: string;
      body: string;
      cc?: string[];
      bcc?: string[];
      replyMessageId?: string;
    };

export interface EmailTransport {
  execute(input: {
    tenantId: string;
    request: EmailInput;
    idempotencyKey?: string;
    correlationId: string;
  }): Promise<CapabilityResult>;
}

export function createEmailAdapter(
  transport: EmailTransport
): CapabilityAdapter<EmailInput, unknown> {
  return {
    id: "email-capability-v1",
    employees: ["EMP-002"],
    capabilities: ["email.read", "email.send"],
    async execute(request: CapabilityRequest<EmailInput>) {
      const isRead =
        request.input.operation === "search" || request.input.operation === "read";

      if (request.capabilityId === "email.read" && !isRead) {
        return {
          ok: false,
          error: {
            code: "EMAIL_OPERATION_MISMATCH",
            message: "email.read cannot send external communications"
          }
        };
      }

      if (request.capabilityId === "email.send" && isRead) {
        return {
          ok: false,
          error: {
            code: "EMAIL_OPERATION_MISMATCH",
            message: "email.send is reserved for external communication"
          }
        };
      }

      return transport.execute({
        tenantId: request.context.tenantId,
        request: request.input,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.context.correlationId
      });
    }
  };
}
