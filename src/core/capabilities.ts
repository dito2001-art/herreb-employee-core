import type { CapabilityDefinition, EmployeeId } from "./contracts";

const ALL: readonly EmployeeId[] = ["EMP-001", "EMP-002", "EMP-003"];

const definitions: CapabilityDefinition[] = [
  { id: "crm.read", description: "Read CRM data", risk: "GREEN", allowedEmployees: ALL },
  { id: "crm.write", description: "Write permitted CRM business data", risk: "YELLOW", allowedEmployees: ["EMP-001", "EMP-002"] },
  { id: "offering.read", description: "Read authoritative offerings", risk: "GREEN", allowedEmployees: ["EMP-001"] },
  { id: "offering.recommend", description: "Recommend authoritative offerings", risk: "GREEN", allowedEmployees: ["EMP-001"] },
  { id: "quote.create", description: "Create a commercial quote", risk: "YELLOW", allowedEmployees: ["EMP-001"] },
  { id: "sale.progress", description: "Progress an accepted commercial transaction", risk: "YELLOW", allowedEmployees: ["EMP-001"] },
  { id: "whatsapp.send", description: "Send an authorized WhatsApp message", risk: "YELLOW", allowedEmployees: ["EMP-001"] },
  { id: "followup.schedule", description: "Schedule a sales follow-up", risk: "GREEN", allowedEmployees: ["EMP-001"] },
  { id: "calendar.read", description: "Read calendar availability and events", risk: "GREEN", allowedEmployees: ["EMP-002"] },
  { id: "calendar.write", description: "Create or change calendar events", risk: "YELLOW", allowedEmployees: ["EMP-002"] },
  { id: "email.read", description: "Read authorized email context", risk: "GREEN", allowedEmployees: ["EMP-002"] },
  { id: "email.send", description: "Send authorized email", risk: "YELLOW", allowedEmployees: ["EMP-002"] },
  { id: "task.schedule", description: "Schedule assistant work", risk: "GREEN", allowedEmployees: ["EMP-002"] },
  { id: "marketing.read", description: "Read marketing data", risk: "GREEN", allowedEmployees: ["EMP-003"] },
  { id: "marketing.write", description: "Change permitted marketing data", risk: "YELLOW", allowedEmployees: ["EMP-003"] },
  { id: "research.web", description: "Perform public web research", risk: "GREEN", allowedEmployees: ["EMP-003"] },
  { id: "content.create", description: "Create marketing content drafts", risk: "GREEN", allowedEmployees: ["EMP-003"] },
  { id: "campaign.schedule", description: "Schedule campaign execution", risk: "YELLOW", allowedEmployees: ["EMP-003"] }
];

const registry = new Map(definitions.map((definition) => [definition.id, definition]));

export function getCapability(id: string): CapabilityDefinition | undefined {
  return registry.get(id);
}

export function listCapabilities(): CapabilityDefinition[] {
  return [...definitions];
}
