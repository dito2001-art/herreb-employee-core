import { EMP003CopyGovernance } from "./emp003-copy-governance";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  MarketingAssetVersionSchema,
  type MarketingAssetVersion
} from "./core/marketing-asset-library";
import {
  buildEMP003ReviewCards,
  type EMP003CampaignReviewCard
} from "./core/emp003-campaign-review-ui-model";
import type { CopyRequest } from "./runtime/emp003-copy-context";

const explanations: Record<string, string> = {
  COPY_CONTEXT_NOT_CONFIGURED:
    "La marca y sus fuentes verificadas todavía no están configuradas para este tenant.",
  COPY_BUCKET_NOT_CONFIGURED:
    "La biblioteca espera un bucket privado autorizado. Todavía no está conectado.",
  COPY_CAMPAIGN_CONTEXT_REQUIRED:
    "Esta revisión de campaña todavía no tiene marca, oferta y claims vinculados por el servidor.",
  COPY_CAMPAIGN_CONTEXT_MISMATCH:
    "La campaña cambió: su vínculo con marca, audiencia y fuentes necesita revisión.",
  COPY_PROVIDER_OR_OUTPUT_FAILED:
    "La IA falló o su respuesta no pasó la validación. No se registró un asset.",
  COPY_QUOTA_EXHAUSTED:
    "Se alcanzó la cuota diaria de generación de este tenant.",
  COPY_CAMPAIGN_IMMUTABLE:
    "La campaña está en revisión o aprobada y no admite nuevos assets.",
  ASSET_REVISION_CONFLICT:
    "El asset cambió. Recargá la biblioteca antes de generar otra versión."
};
async function jsonResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error(
      "La sesión venció o la respuesta no es válida. Volvé a ingresar."
    );
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw Error(
      explanations[String(data.error)] ??
        (response.status === 403
          ? "No tenés permiso para generar."
          : "No se pudo verificar la operación. Consultá su estado antes de reintentar.")
    );
  return data;
}
export function EMP003CopyLibrary() {
  const [campaigns, setCampaigns] = useState<EMP003CampaignReviewCard[]>([]);
  const [tenant, setTenant] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [campaignId, setCampaignId] = useState("");
  const [context, setContext] = useState<{
    campaignRevision: number;
    channels: string[];
    canGenerate: boolean;
  }>();
  const [channel, setChannel] = useState("");
  const [assets, setAssets] = useState<MarketingAssetVersion[]>([]);
  const [assetId, setAssetId] = useState("");
  const [asset, setAsset] = useState<MarketingAssetVersion>();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CopyRequest>();
  const [pendingState, setPendingState] = useState("");
  const key = `emp003-copy:${tenant}:${campaignId}`;
  async function loadCampaigns() {
    const response = await fetch("/api/emp003/operations", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const data = await jsonResponse(response);
    const t = z.string().min(1).parse(data.tenantId);
    setTenant(t);
    setCampaigns(buildEMP003ReviewCards(data, t));
    setCanWrite(
      (data.permissions as { canWrite?: boolean } | undefined)?.canWrite ===
        true
    );
  }
  useEffect(() => {
    void loadCampaigns().catch((e) => setError(e.message));
  }, []);
  const loadLibrary = useCallback(
    async (id = campaignId, active: () => boolean = () => true) => {
      const response = await fetch(
        `/api/emp003/assets?campaignId=${encodeURIComponent(id)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const data = await jsonResponse(response);
      const records = z.array(MarketingAssetVersionSchema).parse(data.assets);
      if (records.some((x) => x.tenantId !== tenant || x.campaignId !== id))
        throw Error("La biblioteca devolvió un alcance inválido.");
      if (active()) setAssets(records);
      return records;
    },
    [campaignId, tenant]
  );
  useEffect(() => {
    setAssets([]);
    setContext(undefined);
    setAsset(undefined);
    setText("");
    setAssetId("");
    setError("");
    setNotice("");
    setPending(undefined);
    setPendingState("");
    if (!campaignId) return;
    let active = true;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const p = JSON.parse(stored) as CopyRequest;
        if (p.campaignId === campaignId) setPending(p);
      }
    } catch {
      setError(
        "No se pudo recuperar el identificador de la operación pendiente."
      );
    }
    setBusy(true);
    void (async () => {
      await loadLibrary(campaignId, () => active);
      if (!active) return;
      const response = await fetch(
        `/api/emp003/assets/context?campaignId=${encodeURIComponent(campaignId)}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const data = await jsonResponse(response);
      const parsed = z
        .object({
          campaignRevision: z.number().int().positive(),
          channels: z.array(z.string()),
          canGenerate: z.boolean()
        })
        .parse(data);
      if (!active) return;
      setContext(parsed);
      setChannel(parsed.channels[0] ?? "");
    })()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, tenant, key, loadLibrary]);
  function clearPending() {
    sessionStorage.removeItem(key);
    setPending(undefined);
    setPendingState("");
  }
  async function open(
    record: MarketingAssetVersion,
    revision = record.revision
  ) {
    setBusy(true);
    setError("");
    setText("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/emp003/assets/content?campaignId=${encodeURIComponent(campaignId)}&assetId=${encodeURIComponent(record.assetId)}&revision=${revision}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      if (!response.ok) {
        await jsonResponse(response);
        throw Error("Lectura no verificada.");
      }
      if (!response.headers.get("content-type")?.startsWith("text/plain"))
        throw Error("Respuesta de contenido inválida.");
      const bytes = await response.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
      )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (
        hash !== response.headers.get("x-content-sha256") ||
        String(revision) !== response.headers.get("x-asset-revision") ||
        (revision === record.revision && hash !== record.sha256)
      )
        throw Error("El contenido no coincide con su hash o revisión.");
      setAsset({ ...record, revision, sha256: hash });
      setText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      setAssetId(record.assetId);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function status() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/emp003/assets/status?campaignId=${encodeURIComponent(campaignId)}&operationId=${pending.operationId}`,
        { credentials: "same-origin", cache: "no-store" }
      );
      const data = await jsonResponse(response);
      setPendingState(String(data.state));
      if (data.state === "SUCCEEDED") {
        clearPending();
        await loadLibrary();
        setNotice("Asset registrado. Abrilo para verificar sus bytes.");
      } else if (data.state === "FAILED") {
        clearPending();
        setError(
          explanations[String(data.error)] ??
            "La operación falló; la cuota reservada no se reembolsa automáticamente."
        );
      } else
        setNotice(
          data.state === "GENERATED"
            ? "La IA terminó. Podés recuperar el registro sin generar otra vez."
            : "La operación sigue pendiente o es ambigua. No se enviará otra generación automáticamente."
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generate(recover = false) {
    if (!context || !channel) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const existing = assets.find((x) => x.assetId === assetId);
      const input =
        recover && pending
          ? pending
          : {
              campaignId,
              assetId: assetId || `copy-${crypto.randomUUID()}`,
              operationId: crypto.randomUUID(),
              expectedRevision: existing?.revision ?? 0,
              campaignRevision: context.campaignRevision,
              channel
            };
      // Persist the exact request before sending. A network failure retains it for status/recovery.
      sessionStorage.setItem(key, JSON.stringify(input));
      setPending(input);
      setPendingState("STARTED");
      const response = await fetch("/api/emp003/assets/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw Error("La sesión venció o la respuesta no es válida.");
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        if (data.state === "FAILED" || data.retrySafe === true) clearPending();
        throw Error(
          explanations[String(data.error)] ??
            "No se pudo verificar la generación."
        );
      }
      if (data.state !== "SUCCEEDED") {
        setNotice(
          "Operación pendiente. Consultá su estado antes de reintentar."
        );
        return;
      }
      const record = MarketingAssetVersionSchema.parse(data.record);
      if (
        record.tenantId !== tenant ||
        record.campaignId !== campaignId ||
        record.assetId !== input.assetId
      )
        throw Error("El asset devolvió un alcance inválido.");
      clearPending();
      await loadLibrary();
      if (!(await open(record)))
        throw Error(
          "El registro existe, pero su lectura independiente no quedó verificada."
        );
      setNotice(
        "Copy registrado y recuperado con hash verificado. No se publicó."
      );
    } catch (e) {
      setError(
        (e as Error).message +
          " Consultá la operación antes de generar nuevamente."
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = campaigns.find((x) => x.campaignId === campaignId);
  const head = assets.find((x) => x.assetId === asset?.assetId);
  return (
    <section
      aria-label="Biblioteca de copy"
      className="emp003-copy-library mt-6 rounded border p-4"
    >
      <style>{`.emp003-copy-library button,.emp003-copy-library select{border:1px solid #888;border-radius:6px;padding:8px 12px;margin:6px 8px 6px 0}.emp003-copy-library button{background:#174ea6;color:white}.emp003-copy-library button:disabled{opacity:.5;cursor:not-allowed}.emp003-copy-library label{display:block;margin-top:10px}.emp003-copy-library select{display:block;background:inherit;color:inherit}.emp003-copy-library pre{border:1px solid #888;padding:12px}`}</style>
      <h2>Biblioteca de copy · borradores privados</h2>
      <p>
        Elegí una campaña guardada. La IA usa la marca y los claims verificados
        del tenant; no publica contenido. La cuota diaria se cuenta en UTC y los
        intentos fallidos también consumen la reserva.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void loadCampaigns().catch((e) => setError(e.message))}
      >
        Actualizar campañas de biblioteca
      </button>
      <label>
        Campaña para assets
        <select
          value={campaignId}
          disabled={busy}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">Seleccioná una campaña guardada</option>
          {campaigns.map((x) => (
            <option key={x.campaignId} value={x.campaignId}>
              {x.name ?? x.objective}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      {campaignId && (
        <>
          <label>
            Canal del copy
            <select
              value={channel}
              disabled={busy || !!pending}
              onChange={(e) => setChannel(e.target.value)}
            >
              {context?.channels.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={
              busy ||
              !!pending ||
              !canWrite ||
              !context?.canGenerate ||
              !channel ||
              selected?.reviewState !== "DRAFT"
            }
            onClick={() => void generate()}
          >
            Generar copy con IA{assetId ? " · nueva versión" : ""}
          </button>
          <button
            type="button"
            disabled={busy || !!pending}
            onClick={() => {
              setAssetId("");
              setAsset(undefined);
              setText("");
            }}
          >
            Nuevo asset de copy
          </button>
          {!canWrite && (
            <p>Tu identidad tiene permiso de lectura, sin generación.</p>
          )}
          {context && !context.channels.length && (
            <p>
              Falta vincular esta revisión de campaña a la marca y sus fuentes
              verificadas.
            </p>
          )}
          {pending && (
            <>
              <p>
                Operación {pending.operationId}:{" "}
                {pendingState || "pendiente de consulta"}
              </p>
              <button disabled={busy} onClick={() => void status()}>
                Consultar operación
              </button>
              {pendingState === "GENERATED" && (
                <button
                  disabled={busy || !canWrite}
                  onClick={() => void generate(true)}
                >
                  Recuperar registro pendiente
                </button>
              )}
            </>
          )}
          <ul aria-label="Assets de campaña">
            {assets.map((x) => (
              <li key={x.assetId}>
                <button disabled={busy} onClick={() => void open(x)}>
                  {x.assetId} · {x.channel} · versión {x.revision}
                </button>
              </li>
            ))}
          </ul>
          {asset && (
            <article aria-label="Copy recuperado">
              <h3>{asset.assetId}</h3>
              <label>
                Versión del asset
                <select
                  disabled={busy}
                  value={asset.revision}
                  onChange={(e) =>
                    head && void open(head, Number(e.target.value))
                  }
                >
                  {Array.from(
                    { length: Math.min(head?.revision ?? 1, 100) },
                    (_, i) => (head?.revision ?? 1) - i
                  ).map((n) => (
                    <option key={n} value={n}>
                      Versión {n}
                    </option>
                  ))}
                </select>
              </label>
              <p>SHA-256: {asset.sha256}</p>
              <pre style={{ whiteSpace: "pre-wrap" }}>{text}</pre>
              <p>
                Asset de preparación · La aprobación exacta se consulta por
                separado. Sin publicación externa.
              </p>
              {context && (
                <EMP003CopyGovernance
                  key={`${tenant}:${asset.assetId}:${asset.revision}:${asset.sha256}`}
                  asset={asset}
                  text={text}
                  campaignRevision={context.campaignRevision}
                  canWrite={
                    canWrite &&
                    selected?.reviewState === "DRAFT" &&
                    asset.revision === head?.revision &&
                    !busy &&
                    !pending
                  }
                  canRecover={canWrite}
                  onWorking={setBusy}
                  onSaved={async (record) => {
                    await loadLibrary();
                    if (!(await open(record)))
                      throw Error(
                        "La nueva revisión existe pero no se pudo verificar su contenido."
                      );
                  }}
                />
              )}
            </article>
          )}
        </>
      )}
    </section>
  );
}
