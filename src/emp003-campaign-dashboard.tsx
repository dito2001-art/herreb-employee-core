import { useEffect, useState } from "react";
import { buildEMP003ReviewCards, type EMP003CampaignReviewCard } from "./core/emp003-campaign-review-ui-model";

const stateLabel: Record<EMP003CampaignReviewCard["reviewState"], string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada"
};

/** Read-only owner workspace. Server resolves tenant from a verified Access JWT. */
export function EMP003CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<EMP003CampaignReviewCard[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/emp003/operations", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal
        });
        if (!response.ok) throw new Error(response.status === 401 ? "Acceso no autorizado" : "No se pudieron consultar las campañas");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || typeof (data as { tenantId?: unknown }).tenantId !== "string")
          throw new Error("Respuesta de campañas inválida");
        const id = (data as { tenantId: string }).tenantId;
        const cards = buildEMP003ReviewCards(data, id);
        if (!controller.signal.aborted) {
          setTenantId(id);
          setCampaigns(cards);
          setSelectedId(cards[0]?.campaignId ?? null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Error de conexión");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const selected = campaigns.find(item => item.campaignId === selectedId);
  return (
    <section className="space-y-5" aria-label="EMP-003 Campañas">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">EMP-003 · Campañas</h1>
        <p className="text-sm text-kumo-subtle">Propuestas y revisiones. La publicación está deshabilitada.</p>
        {tenantId && <p className="text-xs text-kumo-subtle">Empresa: {tenantId}</p>}
      </header>
      {loading && <p role="status">Cargando campañas…</p>}
      {error && <p role="alert" className="text-kumo-danger">{error}</p>}
      {!loading && !error && campaigns.length === 0 && <p>Todavía no hay campañas para mostrar.</p>}
      {!loading && !error && campaigns.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2" aria-label="Listado de campañas">
            {campaigns.map(item => (
              <button key={item.campaignId} type="button" onClick={() => setSelectedId(item.campaignId)}
                aria-pressed={selectedId === item.campaignId}
                className="w-full rounded-lg border border-kumo-line bg-kumo-base p-4 text-left hover:opacity-80">
                <strong className="block">{item.objective}</strong>
                <span className="text-sm text-kumo-subtle">{stateLabel[item.reviewState]} · Rev. {item.revision}</span>
              </button>
            ))}
          </div>
          {selected && (
            <article className="rounded-lg border border-kumo-line bg-kumo-base p-5 space-y-3">
              <h2 className="text-lg font-semibold">{selected.objective}</h2>
              <p>Estado: <strong>{stateLabel[selected.reviewState]}</strong></p>
              <p>Canales: {selected.channels.join(", ") || "Sin canales"}</p>
              <p>Audiencias: {selected.audienceCount}</p>
              <p>Fuentes de evidencia: {selected.evidenceCount}</p>
              <p>Revisión del propietario: {selected.requiresOwnerReview ? "Pendiente" : "No pendiente"}</p>
              <p className="text-sm text-kumo-subtle">Revisión y aprobación se habilitarán mediante acciones autorizadas del servidor.</p>
              <p className="text-sm font-semibold">Publicación: deshabilitada</p>
            </article>
          )}
        </div>
      )}
    </section>
  );
}
