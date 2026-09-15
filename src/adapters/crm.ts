import type {
  CapabilityAdapter,
  CapabilityRequest,
  CapabilityResult
} from "../core";

export interface CrmTransport {
  execute(input: {
    tenantId: string;
    operation: "read" | "create" | "update" | "delete";
    entity: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
    correlationId: string;
  }): Promise<CapabilityResult>;
}

export interface CrmCapabilityInput {
  operation: "read" | "create" | "update" | "delete";
  entity: string;
  payload?: Record<string, unknown>;
}

const READ_ENTITIES = new Set([
  "tasks",
  "companies",
  "contacts",
  "opportunities",
  "projects",
  "clientInteractions",
  "marketingCampaigns",
  "invoices",
  "billingMilestones"
]);

const WRITE_ENTITIES = new Set(READ_ENTITIES);

export function createCrmAdapter(
  transport: CrmTransport
): CapabilityAdapter<CrmCapabilityInput, unknown> {
  return {
    id: "herreb-crm-capability-v1",
    employees: ["EMP-001", "EMP-002", "EMP-003"],
    capabilities: ["crm.read", "crm.write", "marketing.read", "marketing.write"],
    async execute(
      request: CapabilityRequest<CrmCapabilityInput>
    ): Promise<CapabilityResult> {
      const { operation, entity, payload } = request.input;
      const isRead = operation === "read";
      const allowed = isRead ? READ_ENTITIES.has(entity) : WRITE_ENTITIES.has(entity);

      if (!allowed) {
        return {
          ok: false,
          error: {
            code: "CRM_ENTITY_BLOCKED",
            message: `CRM entity is outside the Employee Core allowlist: ${entity}`
          }
        };
      }

      if (request.capabilityId.endsWith(".read") && !isRead) {
        return {
          ok: false,
          error: {
            code: "CRM_OPERATION_MISMATCH",
            message: "Read capability cannot perform a write operation"
          }
        };
      }

      if (request.capabilityId.endsWith(".write") && isRead) {
        return {
          ok: false,
          error: {
            code: "CRM_OPERATION_MISMATCH",
            message: "Write capability cannot be used for a read operation"
          }
        };
      }

      return transport.execute({
        tenantId: request.context.tenantId,
        operation,
        entity,
        payload,
        idempotencyKey: request.idempotencyKey,
        correlationId: request.context.correlationId
      });
    }
  };
}
