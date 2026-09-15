import type {
  CapabilityAdapter,
  CapabilityRequest,
  CapabilityResult,
  EmployeeId
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

const COMMERCIAL_ENTITIES = new Set([
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

function buildAdapter(
  transport: CrmTransport,
  options: {
    id: string;
    employees: readonly EmployeeId[];
    capabilities: readonly string[];
  }
): CapabilityAdapter<CrmCapabilityInput, unknown> {
  return {
    id: options.id,
    employees: options.employees,
    capabilities: options.capabilities,
    async execute(
      request: CapabilityRequest<CrmCapabilityInput>
    ): Promise<CapabilityResult> {
      const { operation, entity, payload } = request.input;
      const isRead = operation === "read";

      if (!COMMERCIAL_ENTITIES.has(entity)) {
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

export function createCrmAdapter(
  transport: CrmTransport
): CapabilityAdapter<CrmCapabilityInput, unknown> {
  return buildAdapter(transport, {
    id: "herreb-crm-capability-v1",
    employees: ["EMP-001", "EMP-002"],
    capabilities: ["crm.read", "crm.write"]
  });
}

export function createMarketingCrmAdapter(
  transport: CrmTransport
): CapabilityAdapter<CrmCapabilityInput, unknown> {
  return buildAdapter(transport, {
    id: "herreb-marketing-crm-capability-v1",
    employees: ["EMP-003"],
    capabilities: ["crm.read", "marketing.read", "marketing.write"]
  });
}
