import { useState } from "react";
import { Button, Badge } from "@cloudflare/kumo";
import {
  ChatCircleDotsIcon,
  GearIcon,
  MegaphoneIcon
} from "@phosphor-icons/react";
import { EMP002CalendarDashboard } from "./emp002-calendar-dashboard";
import { EMP001SalesDashboard } from "./emp001-sales-dashboard";
import { EMP003Workspace } from "./emp003-workspace";

export type WorkforceView =
  | "assistant"
  | "admin"
  | "marketer"
  | "calendar"
  | "sales";

export function WorkforceShell() {
  const [view, setView] = useState<WorkforceView>("calendar");

  return (
    <div className="h-screen flex flex-col bg-kumo-elevated">
      <nav
        className="px-5 py-3 bg-kumo-base border-b border-kumo-line"
        aria-label="HerreB AI Workforce navigation"
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <strong className="text-kumo-default">HerreB AI Workforce</strong>
            <Badge variant="secondary">Workforce</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={view === "sales" ? "primary" : "secondary"}
              onClick={() => setView("sales")}
            >
              EMP-001
            </Button>
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
              variant={view === "calendar" ? "primary" : "secondary"}
              onClick={() => setView("calendar")}
            >
              Agenda y tareas
            </Button>
            <Button
              size="sm"
              variant={view === "marketer" ? "primary" : "secondary"}
              icon={<MegaphoneIcon size={15} />}
              onClick={() => setView("marketer")}
            >
              EMP-003
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
        {view === "assistant" ? (
          <section aria-label="Capacidad no disponible" className="p-5">
            <h2>Chat del asistente no conectado</h2>
            <p>
              Usá Agenda y tareas para consultar y gestionar el calendario
              nativo. Este ingreso no habilita chat ni recordatorios WhatsApp.
            </p>
          </section>
        ) : view === "sales" ? (
          <div className="max-w-5xl mx-auto p-5 overflow-y-auto h-full">
            <EMP001SalesDashboard />
          </div>
        ) : view === "calendar" ? (
          <div className="max-w-5xl mx-auto p-5 overflow-y-auto h-full">
            <EMP002CalendarDashboard />
          </div>
        ) : view === "marketer" ? (
          <div className="max-w-5xl mx-auto p-5 overflow-y-auto h-full">
            <EMP003Workspace />
          </div>
        ) : (
          <section aria-label="Capacidad no disponible" className="p-5">
            <h2>Administración no habilitada</h2>
            <p>
              La configuración y los permisos requieren un ingreso de
              administración autorizado.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
