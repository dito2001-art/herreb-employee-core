import type { EmployeeId, EmployeeManifest } from "./contracts";

const manifests = {
  "EMP-001": {
    id: "EMP-001",
    name: "AI Sales Rep",
    productName: "EMP-001 AI Sales Rep",
    purpose:
      "Sell tenant offerings end-to-end without inventing commercial facts.",
    capabilities: [
      "offering.read",
      "offering.recommend",
      "quote.create",
      "sale.progress",
      "crm.read",
      "crm.write",
      "whatsapp.send",
      "followup.schedule"
    ]
  },
  "EMP-002": {
    id: "EMP-002",
    name: "AI Assistant",
    productName: "EMP-002 AI Assistant",
    purpose:
      "Coordinate work, communications, tasks and schedules for the tenant.",
    capabilities: [
      "crm.read",
      "crm.write",
      "calendar.read",
      "calendar.write",
      "email.read",
      "email.send",
      "task.schedule"
    ]
  },
  "EMP-003": {
    id: "EMP-003",
    name: "AI Marketer",
    productName: "EMP-003 AI Marketer",
    purpose:
      "Research, plan, create, execute and measure tenant marketing work.",
    capabilities: [
      "crm.read",
      "marketing.read",
      "marketing.write",
      "research.web",
      "content.create",
      "campaign.schedule"
    ]
  }
} as const satisfies Record<EmployeeId, EmployeeManifest>;

export function getEmployeeManifest(id: EmployeeId): EmployeeManifest {
  return manifests[id];
}

export function listEmployeeManifests(): EmployeeManifest[] {
  return Object.values(manifests);
}
