import { useEffect, useState } from "react";

type ImageJob = {
  id: string;
  campaignId: string;
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  scheduledAt: string | null;
  status: "DRAFT" | "SCHEDULED" | "APPROVED" | "FAILED";
};
type Workspace = {
  tenantId: string;
  permissions: { canGenerate: boolean; canSchedule: boolean; canConfigure: boolean };
  jobs: ImageJob[];
  brand: { name: string; revision: string };
};
/**
 * EMP-003 V2 candidate control panel. No client-provided tenant identifiers.
 * Requires server endpoints that derive tenant from verified authentication:
 * GET  /api/emp003/v2/images/workspace
 * POST /api/emp003/v2/images/generate
 * POST /api/emp003/v2/images/schedule
 * All POST responses must confirm persisted read-back before success.
 * No publishing occurs in this component.
 */
export function EMP003ImageControlPanel() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ImageJob["aspectRatio"]>("4:5");
  const [scheduledAt, setScheduledAt] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);

  async function load() {
    const response = await fetch("/api/emp003/v2/images/workspace", {
      credentials: "same-origin", cache: "no-store",
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("No se pudo verificar la sesión y configuración del cliente.");
    }
    const body: unknown = await response.json();
    if (!isWorkspace(body)) throw new Error("Configuración del cliente inválida.");
    setWorkspace(body);
    setReloadRequired(false);
  }
  useEffect(() => {
    let active = true;
    void load().catch(e => { if (active) setError(String(e.message)); });
    return () => { active = false; };
  }, []);

  async function post(path: string, body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    setReloadRequired(true);
    try {
      const response = await fetch(path, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(response.status === 409
        ? "La operación ya existe o cambió. Recargá el panel."
        : "No se pudo confirmar la operación. Recargá antes de reintentar.");
      const result: unknown = await response.json();
      if (!isAcknowledgement(result)) throw new Error("Falta confirmación de guardado.");
      await load();
      setNotice("Operación guardada y verificada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido.");
    } finally {
      setBusy(false);
    }
  }
  const canGenerate = !!workspace?.permissions.canGenerate && !busy && !reloadRequired;
  const canSchedule = !!workspace?.permissions.canSchedule && !busy && !reloadRequired;
  return (
    <section aria-label="EMP-003 Creative Studio">
      <h2>Creative Studio · Imágenes</h2>
      <p>{workspace ? `Cliente: ${workspace.brand.name}` : "Verificando acceso..."}</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button type="button" onClick={() => void load().catch(e => setError(String(e.message)))} disabled={busy}>
        Actualizar
      </button>
      <fieldset disabled={!canGenerate}>
        <legend>Generar imagen con OpenAI</legend>
        <label>Campaña <input value={campaignId} onChange={e => setCampaignId(e.target.value)} /></label>
        <label>Descripción <textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} /></label>
        <label>Formato <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value as ImageJob["aspectRatio"])}>
          <option value="1:1">Cuadrado</option>
          <option value="4:5">Publicación vertical</option>
          <option value="9:16">Historia</option>
          <option value="16:9">Horizontal</option>
        </select></label>
        <button type="button" disabled={!campaignId.trim() || !prompt.trim()} onClick={() => void post(
          "/api/emp003/v2/images/generate",
          { campaignId, prompt, aspectRatio, operationId: crypto.randomUUID() },
        )}>Generar borrador</button>
      </fieldset>
      <h3>Imágenes y programación</h3>
      <label>Imagen <select value={selectedJobId} onChange={e => setSelectedJobId(e.target.value)}>
        <option value="">Seleccionar</option>
        {workspace?.jobs.map(job => <option key={job.id} value={job.id}>{job.id} · {job.status}</option>)}
      </select></label>
      <label>Fecha y hora <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></label>
      <button type="button" disabled={!canSchedule || !selectedJobId || !scheduledAt} onClick={() => void post(
        "/api/emp003/v2/images/schedule",
        { jobId: selectedJobId, scheduledAt, operationId: crypto.randomUUID() },
      )}>Programar (sin publicar)</button>
      <p>La publicación requiere aprobación y conexión de canal verificadas por el servidor.</p>
    </section>
  );
}
function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Workspace>;
  return typeof v.tenantId === "string" && !!v.tenantId &&
    typeof v.brand?.name === "string" && typeof v.brand?.revision === "string" &&
    typeof v.permissions?.canGenerate === "boolean" &&
    typeof v.permissions?.canSchedule === "boolean" &&
    typeof v.permissions?.canConfigure === "boolean" &&
    Array.isArray(v.jobs) && v.jobs.every(j =>
      typeof j.id === "string" && typeof j.campaignId === "string" &&
      ["DRAFT","SCHEDULED","APPROVED","FAILED"].includes(j.status));
}
function isAcknowledgement(value: unknown): value is { ok: true; readBackConfirmed: true } {
  if (!value || typeof value !== "object") return false;
  const v = value as { ok?: unknown; readBackConfirmed?: unknown };
  return v.ok === true && v.readBackConfirmed === true;
}
