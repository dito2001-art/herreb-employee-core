import { z } from "zod";
import { useEffect, useState } from "react";
import {
  buildEMP003ReviewCards,
  type EMP003CampaignReviewCard
} from "./core/emp003-campaign-review-ui-model";
import {
  MarketingCampaignBlueprintSchema,
  type MarketingCampaignBlueprint
} from "./core/marketing-campaign-blueprint";

const labels = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada"
};
const lines = (value: string) => value.split("\n");
const responseSchema = z
  .object({
    ok: z.boolean().optional(),
    found: z.boolean().optional(),
    tenantId: z.string().optional(),
    campaignId: z.string().optional(),
    campaign: z.unknown().optional(),
    revision: z.number().int().positive().optional(),
    readBackConfirmed: z.boolean().optional(),
    permissions: z.object({ canWrite: z.boolean() }).optional()
  })
  .passthrough();
const json = async (response: Response) =>
  responseSchema.parse(await response.json());
const message = (status: number) =>
  status === 409
    ? "La campaña cambió o ya no admite edición. Volvé a cargarla antes de guardar."
    : status === 401 || status === 403
      ? "No tenés permiso para esta operación."
      : "No se pudo verificar la operación. Recargá la campaña para comprobar su estado antes de reintentar.";

/** All writes require server authorization and authoritative read-back. No external publication. */
export function EMP003CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<EMP003CampaignReviewCard[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<MarketingCampaignBlueprint | null>(null);
  const [revision, setRevision] = useState<number | undefined>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [mustReload, setMustReload] = useState(false);
  const [reason, setReason] = useState("");
  const selected = campaigns.find((c) => c.campaignId === selectedId);
  const editable =
    canWrite &&
    (!selected || selected.reviewState === "DRAFT") &&
    !busy &&
    !mustReload;

  async function loadList() {
    const response = await fetch("/api/emp003/operations", {
      credentials: "same-origin",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(message(response.status));
    const raw = await json(response);
    if (typeof raw?.tenantId !== "string")
      throw new Error("Respuesta de campañas inválida.");
    const cards = buildEMP003ReviewCards(raw, raw.tenantId);
    return {
      tenantId: raw.tenantId,
      cards,
      canWrite: raw.permissions?.canWrite === true
    };
  }
  function applyList(data: Awaited<ReturnType<typeof loadList>>) {
    setTenantId(data.tenantId);
    setCampaigns(data.cards);
    setCanWrite(data.canWrite);
  }
  const list = async () => applyList(await loadList());
  useEffect(() => {
    let active = true;
    void loadList()
      .then((data) => {
        if (active) applyList(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function open(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setDraft(null);
    setSelectedId(id);
    setRevision(undefined);
    setMustReload(true);
    try {
      const response = await fetch(
        `/api/emp003/drafts?campaignId=${encodeURIComponent(id)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      if (!response.ok) throw new Error(message(response.status));
      const body = await json(response);
      const parsed = MarketingCampaignBlueprintSchema.safeParse(body.campaign);
      if (
        body.ok !== true ||
        body.found !== true ||
        body.campaignId !== id ||
        !parsed.success ||
        parsed.data.tenantId !== tenantId ||
        !Number.isSafeInteger(body.revision) ||
        (body.revision ?? 0) < 1
      )
        throw new Error("No se pudo verificar la campaña guardada.");
      await list();
      setDraft(parsed.data);
      setRevision(body.revision);
      setMustReload(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setBusy(false);
    }
  }
  function create() {
    setSelectedId(`campaign-${crypto.randomUUID()}`);
    setRevision(undefined);
    setError("");
    setNotice("");
    setMustReload(false);
    setDraft({
      tenantId,
      correlationId: crypto.randomUUID(),
      objective: "",
      audiences: [],
      positioning: "",
      keyMessages: [],
      channels: [],
      kpis: [],
      assumptions: [],
      evidenceRefs: [],
      status: "DRAFT",
      publishApproved: false
    });
  }
  async function save() {
    if (!draft || !editable) return;
    const parsed = MarketingCampaignBlueprintSchema.safeParse({
      ...draft,
      audiences: draft.audiences.map((s) => s.trim()).filter(Boolean),
      keyMessages: draft.keyMessages.map((s) => s.trim()).filter(Boolean),
      assumptions: draft.assumptions.map((s) => s.trim()).filter(Boolean),
      evidenceRefs: draft.evidenceRefs.map((s) => s.trim()).filter(Boolean),
      channels: draft.channels.map((c) => ({
        ...c,
        actions: c.actions.map((s) => s.trim()).filter(Boolean)
      }))
    });
    if (!parsed.success) {
      setError(
        "Completá objetivo, audiencia, posicionamiento, mensajes, canales, KPI y al menos una fuente HTTPS."
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/emp003/drafts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedId,
          blueprint: parsed.data,
          ...(revision === undefined ? {} : { expectedRevision: revision })
        })
      });
      if (!response.ok) throw new Error(message(response.status));
      const receipt = await json(response);
      if (
        receipt.ok !== true ||
        receipt.readBackConfirmed !== true ||
        !Number.isSafeInteger(receipt.revision)
      )
        throw new Error("No se confirmó la persistencia.");
      const get = await fetch(
        `/api/emp003/drafts?campaignId=${encodeURIComponent(selectedId)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      if (!get.ok)
        throw new Error(
          "Falló la lectura posterior. Recargá antes de reintentar."
        );
      const read = await json(get);
      const saved = MarketingCampaignBlueprintSchema.safeParse(read.campaign);
      if (
        read.ok !== true ||
        read.found !== true ||
        read.campaignId !== selectedId ||
        read.revision !== receipt.revision ||
        !saved.success ||
        JSON.stringify(saved.data) !== JSON.stringify(parsed.data)
      )
        throw new Error(
          "La lectura posterior no coincide. Recargá antes de reintentar."
        );
      await list();
      setDraft(saved.data);
      setRevision(read.revision);
      setNotice("Campaña guardada y verificada.");
    } catch (e) {
      setMustReload(true);
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setBusy(false);
    }
  }
  async function transition(
    to: "IN_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT"
  ) {
    if (!selected || !canWrite || !reason.trim() || busy || mustReload) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/emp003/review", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedId,
          from: selected.reviewState,
          to,
          reason: reason.trim(),
          idempotencyKey: crypto.randomUUID()
        })
      });
      if (!response.ok) throw new Error(message(response.status));
      const body = await json(response);
      if (body.ok !== true || body.readBackConfirmed !== true)
        throw new Error("No se confirmó el cambio de estado.");
      await list();
      setReason("");
      setNotice("Estado actualizado y verificado.");
    } catch (e) {
      setMustReload(true);
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setBusy(false);
    }
  }
  const field = (label: string, key: "objective" | "positioning") => (
    <label className="block">
      {label}
      <textarea
        className="block w-full rounded border p-2"
        value={draft?.[key] ?? ""}
        disabled={!editable}
        onChange={(e) => setDraft((d) => d && { ...d, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <section className="space-y-4" aria-label="EMP-003 Campañas">
      <h1 className="text-2xl font-bold">EMP-003 · Campañas</h1>
      <p>
        Creá, guardá y revisá tus campañas. La publicación externa está
        deshabilitada.
      </p>
      {busy && <output>Procesando…</output>}
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      <button disabled={!canWrite || busy} onClick={create}>
        Nueva campaña
      </button>
      <div className="grid gap-4 md:grid-cols-2">
        <nav className="space-y-2" aria-label="Listado de campañas">
          {!busy && !campaigns.length && <p>Todavía no hay campañas.</p>}
          {campaigns.map((c) => (
            <button
              className="block w-full rounded border p-3 text-left"
              disabled={busy}
              key={c.campaignId}
              aria-pressed={selectedId === c.campaignId}
              onClick={() => void open(c.campaignId)}
            >
              {c.objective} · {labels[c.reviewState]}
            </button>
          ))}
        </nav>
        {draft && (
          <article className="space-y-3 rounded border p-4">
            <p>
              {selected ? labels[selected.reviewState] : "Nuevo borrador"} ·{" "}
              {revision === undefined ? "Sin guardar" : `Versión ${revision}`}
            </p>
            {field("Objetivo", "objective")}
            {field("Posicionamiento", "positioning")}
            {(
              [
                ["Audiencias (una por línea)", "audiences"],
                ["Mensajes clave (uno por línea)", "keyMessages"],
                ["Supuestos (uno por línea)", "assumptions"],
                ["Fuentes HTTPS (una por línea)", "evidenceRefs"]
              ] as const
            ).map(([label, key]) => (
              <label className="block" key={key}>
                {label}
                <textarea
                  className="block w-full rounded border p-2"
                  value={draft[key].join("\n")}
                  disabled={!editable}
                  onChange={(e) =>
                    setDraft((d) => d && { ...d, [key]: lines(e.target.value) })
                  }
                />
              </label>
            ))}
            <label className="block">
              Canal
              <textarea
                className="block w-full rounded border p-2"
                value={draft.channels[0]?.name ?? ""}
                disabled={!editable}
                onChange={(e) =>
                  setDraft(
                    (d) =>
                      d && {
                        ...d,
                        channels: [
                          {
                            name: e.target.value,
                            actions: d.channels[0]?.actions ?? []
                          },
                          ...d.channels.slice(1)
                        ]
                      }
                  )
                }
              />
            </label>
            <label className="block">
              Acciones del canal (una por línea)
              <textarea
                className="block w-full rounded border p-2"
                value={draft.channels[0]?.actions.join("\n") ?? ""}
                disabled={!editable}
                onChange={(e) =>
                  setDraft(
                    (d) =>
                      d && {
                        ...d,
                        channels: [
                          {
                            name: d.channels[0]?.name ?? "",
                            actions: lines(e.target.value)
                          },
                          ...d.channels.slice(1)
                        ]
                      }
                  )
                }
              />
            </label>
            {(
              [
                ["Indicador", "metric"],
                ["Meta", "target"],
                ["Medición", "measurement"]
              ] as const
            ).map(([label, key]) => (
              <label className="block" key={key}>
                {label}
                <input
                  className="block w-full rounded border p-2"
                  value={draft.kpis[0]?.[key] ?? ""}
                  disabled={!editable}
                  onChange={(e) =>
                    setDraft(
                      (d) =>
                        d && {
                          ...d,
                          kpis: [
                            {
                              ...(d.kpis[0] ?? {
                                metric: "",
                                target: "",
                                measurement: ""
                              }),
                              [key]: e.target.value
                            },
                            ...d.kpis.slice(1)
                          ]
                        }
                    )
                  }
                />
              </label>
            ))}
            <button disabled={!editable} onClick={() => void save()}>
              Guardar y verificar
            </button>
            {revision !== undefined || mustReload ? (
              <button disabled={busy} onClick={() => void open(selectedId)}>
                Recargar campaña
              </button>
            ) : null}
            {selected && canWrite && (
              <>
                <label className="block">
                  Motivo de revisión
                  <input
                    className="block w-full rounded border p-2"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={busy || mustReload}
                  />
                </label>
                {selected.reviewState === "DRAFT" && (
                  <button
                    disabled={busy || mustReload || !reason.trim()}
                    onClick={() => void transition("IN_REVIEW")}
                  >
                    Enviar a revisión
                  </button>
                )}
                {selected.reviewState === "IN_REVIEW" && (
                  <>
                    <button
                      disabled={busy || mustReload || !reason.trim()}
                      onClick={() => void transition("APPROVED")}
                    >
                      Aprobar
                    </button>
                    <button
                      disabled={busy || mustReload || !reason.trim()}
                      onClick={() => void transition("REJECTED")}
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {selected.reviewState === "REJECTED" && (
                  <button
                    disabled={busy || mustReload || !reason.trim()}
                    onClick={() => void transition("DRAFT")}
                  >
                    Volver a borrador
                  </button>
                )}
              </>
            )}
            <p>Publicación externa: deshabilitada.</p>
          </article>
        )}
      </div>
    </section>
  );
}
