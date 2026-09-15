import { z } from "zod";
import { EmployeeIdSchema } from "../core";

export const EmployeeSessionStateSchema = z.object({
  tenantId: z.string().min(1),
  employeeId: EmployeeIdSchema,
  workspaceId: z.string().min(1),
  actorId: z.string().min(1),
  channel: z.string().min(1).default("web")
});

export type EmployeeSessionState = z.infer<typeof EmployeeSessionStateSchema>;

export function parseEmployeeSessionState(state: unknown): EmployeeSessionState {
  return EmployeeSessionStateSchema.parse(state);
}
