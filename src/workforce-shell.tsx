import { useState, type ReactNode } from "react";
import { Button, Badge } from "@cloudflare/kumo";
import { ChatCircleDotsIcon, GearIcon } from "@phosphor-icons/react";
import { WorkforceAdminPanel } from "./workforce-admin-panel";

export type WorkforceView = "assistant" | "admin";

export function WorkforceShell({ assistant }: { assistant: ReactNode }) {
  const [view, setView] = useState<WorkforceView>("assistant");

  return (
    <div className="h-screen flex flex-col bg-kumo-elevated">
      <nav className="px-5 py-3 bg-kumo-base border-b border-kumo-line" aria-label="HerreB AI Workforce navigation">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <strong className="text-kumo-default">HerreB AI Workforce</strong>
            <Badge variant="secondary">Client 0</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={view === "assistant" ? "primary" : "secondary"}
              icon={<ChatCircleDotsIcon size={15} />}
              onClick={() => setView("assistant")}
            >
              EMP-002
            </Button>
            <Button
              size="sm"
              variant={view === "admin" ? "primary" : "secondary"}
              icon={<GearIcon size={15} />}
              onClick={() => setView("admin")}
            >
              Admin
            </Button>
          </div>
        </div>
      </nav>
      <main className="min-h-0 flex-1">
        {view === "assistant" ? assistant : (
          <div className="max-w-5xl mx-auto p-5 overflow-y-auto h-full">
            <WorkforceAdminPanel />
          </div>
        )}
      </main>
    </div>
  );
}
