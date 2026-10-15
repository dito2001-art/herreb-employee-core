import { useEffect, useState } from "react";
import { buildEMP003ReviewCards, type EMP003CampaignReviewCard } from "./core/emp003-campaign-review-ui-model";
import type { MarketingCampaignBlueprint } from "./core/marketing-campaign-blueprint";

const stateLabel: Record<EMP003CampaignReviewCard["reviewState"], string> = {
  DRAFT: "Borrador sin aprobar", IN_REVIEW: "En revisión", APPROVED: "Aprobada por el propietario", REJECTED: "Rechazada"
};
const split = (value: string) => value.split("\\n").map(item => item.trim()).filter(Boolean);
const newId = () => `herreb-${Date.now().toString(36)}`;

export function EMP003CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<EMP003CampaignReviewCard[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [objective, setObjective] = useState("");
  const [audiences, setAudiences] = useState("");
  const [positioning, setPositioning] = useState("");
  const [messages, setMessages] = useState("");
  const [channelName, setChannelName] = useState("LinkedIn");
  const [channelActions, setChannelActions] = useState("");
  const [kpiMetric, setKpiMetric] = useState("Reuniones de diagnóstico");
  const [kpiTarget, setKpiTarget] = useState("4-6 durante el piloto (hipótesis)");
  const [kpiMeasurement, setKpiMeasurement] = useState("CRM: reuniones agendadas y realizadas");
  const [assumptions, setAssumptions] = useState("");
  const [evidence, setEvidence] = useState("https://herreb.com");
  const [campaignId, setCampaignId] = useState(newId());

  async function load(preferredId?: string) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/emp003/operations", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Acceso no autorizado" : "No se pudieron consultar las campañas");
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || typeof (data as { tenantId?: unknown }).tenantId !== "string") throw new Error("Respuesta de campañas inválida");
      const id = (data as { tenantId: string }).tenantId;
      const cards = buildEMP003ReviewCards(data, id);
      setTenantId(id); setCampaigns(cards);
      const nextId = preferredId ?? selectedId ?? cards[0]?.campaignId ?? null;
      setSelectedId(nextId);
      const selected = cards.find(item => item.campaignId === nextId);
      if (selected) {
        const draftResponse = await fetch(`/api/emp003/drafts?campaignId=${encodeURIComponent(selected.campaignId)}`, { credentials: "same-origin", cache: "no-store" });
        if (draftResponse.ok) {
          const stored = await draftResponse.json() as { campaign?: MarketingCampaignBlueprint };
          const blueprint = stored.campaign;
          if (blueprint) {
            setCampaignId(selected.campaignId); setObjective(blueprint.objective);
            setAudiences(blueprint.audiences.join("\\n")); setPositioning(blueprint.positioning);
            setMessages(blueprint.keyMessages.join("\\n")); setChannelName(blueprint.channels[0]?.name ?? "LinkedIn");
            setChannelActions(blueprint.channels[0]?.actions.join("\\n") ?? "");
            setKpiMetric(blueprint.kpis[0]?.metric ?? ""); setKpiTarget(blueprint.kpis[0]?.target ?? "");
            setKpiMeasurement(blueprint.kpis[0]?.measurement ?? ""); setAssumptions(blueprint.assumptions.join("\\n"));
            setEvidence(blueprint.evidenceRefs.join("\\n"));
          }
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error de conexión"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const selected = campaigns.find(item => item.campaignId === selectedId);
  const editable = !selected || selected.reviewState === "DRAFT";
  async function save() {
    setSaving(true); setError(""); setNotice("");
    try {
      const nextId = selectedId && selected?.reviewState === "DRAFT" ? selectedId : campaignId;
      const blueprint: MarketingCampaignBlueprint = {
        tenantId, correlationId: `ui-${nextId}`, objective: objective.trim(), audiences: split(audiences),
        positioning: positioning.trim(), keyMessages: split(messages),
        channels: [{ name: channelName.trim(), actions: split(channelActions) }],
        kpis: [{ metric: kpiMetric.trim(), target: kpiTarget.trim(), measurement: kpiMeasurement.trim() }],
        assumptions: split(assumptions), evidenceRefs: split(evidence), status: "DRAFT", publishApproved: false
      };
      const response = await fetch("/api/emp003/drafts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: nextId, blueprint }) });
      const result = await response.json() as { ok?: boolean; error?: string; readBackConfirmed?: boolean; persisted?: boolean };
      if (!response.ok || !result.ok || !result.persisted || !result.readBackConfirmed) throw new Error(result.error ?? "No se pudo confirmar la persistencia");
      setCampaignId(nextId); setSelectedId(nextId);
      await load(nextId);
      setNotice("Borrador guardado y vuelto a consultar. Sigue sin aprobación del propietario y no se publicó.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el borrador"); }
    finally { setSaving(false); }
  }
  function startNew() {
    const id = newId(); setCampaignId(id); setSelectedId(null); setObjective("Captar reuniones de diagnóstico para consultoría de crecimiento e IA");
    setAudiences("Dirección general y propietarios de empresas medianas\nGerencias de Marketing y Comercial");
    setPositioning("HerreB conecta estrategia, experiencias y soluciones de IA para convertir oportunidades en crecimiento.");
    setMessages("Convertimos estrategia en experiencias. Y experiencias en crecimiento.\nAgendá un diagnóstico de 30 minutos para identificar una oportunidad concreta.");
    setChannelName("LinkedIn"); setChannelActions("Publicación educativa sobre estrategia + ejecución\nCTA a diagnóstico de 30 minutos");
    setKpiMetric("Reuniones de diagnóstico"); setKpiTarget("4-6 en cuatro semanas (hipótesis)"); setKpiMeasurement("Registro semanal en CRM");
    setAssumptions("Objetivos iniciales sujetos a revisión de la base y capacidad comercial.\nTodo contenido y contacto requiere aprobación humana.");
    setEvidence("https://herreb.com"); setNotice("Nueva propuesta en edición; todavía no está guardada."); setError("");
  }
  return (
    <section className="space-y-5" aria-label="EMP-003 Campañas">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">EMP-003 · Campañas</h1>
        <p className="text-sm text-kumo-subtle">Propuesta generada → borrador persistido → aprobación del propietario. La publicación y los envíos externos están deshabilitados.</p>
        {tenantId && <p className="text-xs text-kumo-subtle">Empresa autenticada: {tenantId}</p>}
      </header>
      {loading && <output>Cargando campañas…</output>}
      {error && <p role="alert" className="text-kumo-danger">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={startNew} className="rounded-lg border border-kumo-line px-3 py-2">Nueva propuesta</button>
        <button type="button" onClick={() => void load(selectedId ?? undefined)} className="rounded-lg border border-kumo-line px-3 py-2">Volver a consultar</button>
      </div>
      {!loading && (campaigns.length > 0 || objective.length > 0) && <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2" aria-label="Listado de campañas">
          {campaigns.map(item => <button key={item.campaignId} type="button" onClick={() => { setSelectedId(item.campaignId); void load(item.campaignId); }} aria-pressed={selectedId === item.campaignId} className="w-full rounded-lg border border-kumo-line bg-kumo-base p-3 text-left hover:opacity-80">
            <strong className="block">{item.objective}</strong><span className="text-sm text-kumo-subtle">{stateLabel[item.reviewState]} · Rev. {item.revision}</span>
          </button>)}
        </div>
        <div className="md:col-span-2 rounded-lg border border-kumo-line p-4 space-y-3">
          {selected && <p className="text-sm">Estado actual: <strong>{stateLabel[selected.reviewState]}</strong>. {selected.reviewState !== "DRAFT" ? "Este borrador está bloqueado para edición." : "Los cambios requieren guardado explícito."}</p>}
          <label className="block text-sm font-medium">Objetivo<textarea aria-label="Objetivo" value={objective} onChange={e => setObjective(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={2}/></label>
          <label className="block text-sm font-medium">Audiencias (una por línea)<textarea aria-label="Audiencias" value={audiences} onChange={e => setAudiences(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={3}/></label>
          <label className="block text-sm font-medium">Propuesta de valor<textarea aria-label="Propuesta de valor" value={positioning} onChange={e => setPositioning(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={3}/></label>
          <label className="block text-sm font-medium">Mensajes (uno por línea)<textarea aria-label="Mensajes" value={messages} onChange={e => setMessages(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={3}/></label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium">Canal<input aria-label="Canal" value={channelName} onChange={e => setChannelName(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2"/></label>
            <label className="block text-sm font-medium">Acciones (una por línea)<textarea aria-label="Acciones" value={channelActions} onChange={e => setChannelActions(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={3}/></label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm font-medium">KPI<input aria-label="KPI" value={kpiMetric} onChange={e => setKpiMetric(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2"/></label>
            <label className="block text-sm font-medium">Meta<input aria-label="Meta KPI" value={kpiTarget} onChange={e => setKpiTarget(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2"/></label>
            <label className="block text-sm font-medium">Medición<input aria-label="Medición KPI" value={kpiMeasurement} onChange={e => setKpiMeasurement(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2"/></label>
          </div>
          <label className="block text-sm font-medium">Supuestos (uno por línea)<textarea aria-label="Supuestos" value={assumptions} onChange={e => setAssumptions(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={2}/></label>
          <label className="block text-sm font-medium">Fuentes HTTPS (una por línea)<textarea aria-label="Fuentes" value={evidence} onChange={e => setEvidence(e.target.value)} disabled={!editable} className="mt-1 w-full rounded border p-2" rows={2}/></label>
          <button type="button" onClick={() => void save()} disabled={saving || loading || !editable || !objective.trim() || !audiences.trim() || !positioning.trim() || !messages.trim() || !channelName.trim() || !channelActions.trim() || !kpiMetric.trim() || !kpiTarget.trim() || !kpiMeasurement.trim() || !evidence.trim()} className="rounded-lg bg-kumo-accent px-4 py-2 font-semibold disabled:opacity-50">{saving ? "Guardando y verificando…" : "Guardar y verificar persistencia"}</button>
          <p className="text-xs text-kumo-subtle">Guardar escribe solo el borrador de este tenant y lo vuelve a leer desde el almacenamiento. No aprueba, publica ni envía comunicaciones.</p>
        </div>
      </div>}
      {!loading && campaigns.length === 0 && <p>Todavía no hay campañas guardadas. Podés crear una propuesta con “Nueva propuesta”.</p>}
    </section>
  );
}
