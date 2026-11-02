import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  CopyBrandViewSchema,
  CopyApprovalSchema,
  CopyEditInput,
  CopyApproveInput
} from "./core/emp003-copy-lifecycle-contracts";
import {
  MarketingAssetVersionSchema,
  type MarketingAssetVersion
} from "./core/marketing-asset-library";

const Pending = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edit"), body: CopyEditInput }),
  z.object({ kind: z.literal("approve"), body: CopyApproveInput })
]);
type Brand = z.infer<typeof CopyBrandViewSchema>;
type Approval = {
  approval: z.infer<typeof CopyApprovalSchema> | null;
  active: boolean;
};
const readOptions = { credentials: "same-origin", cache: "no-store" } as const;
function explanation(code: string) {
  if (code.includes("CONFLICT") || code.includes("IMMUTABLE"))
    return "La revisión, campaña o marca cambió. Recargá la biblioteca antes de continuar.";
  if (code.includes("IN_FLIGHT"))
    return "Hay otra operación sobre este asset. Esperá y consultá su resultado.";
  if (code.includes("KNOWLEDGE") || code.includes("CONTEXT"))
    return "Falta un vínculo válido con la marca y sus fuentes verificadas.";
  return "No se pudo confirmar la operación. Conservamos su identificador para recuperarla sin crear otra versión.";
}
async function readBrand(tenantId: string, revision?: number) {
  const response = await fetch(
    `/api/emp003/assets/brand-brain${revision ? `?revision=${revision}` : ""}`,
    readOptions
  );
  if (!response.ok)
    throw Error(
      "La marca autoritativa no está disponible para esta identidad."
    );
  const view = CopyBrandViewSchema.parse(await response.json());
  if (view.tenantId !== tenantId || view.brand.tenantId !== tenantId)
    throw Error("La marca devolvió un alcance inválido.");
  return view;
}
function BrandFacts({ brand }: { brand: Brand }) {
  return (
    <div>
      <p>
        Marca: {brand.brand.name} · Perfil {brand.revision}
      </p>
      <p>Hash de configuración: {brand.hash}</p>
      <p>Voz: {brand.brand.voice.join(" · ")}</p>
      <p>
        Restricciones:{" "}
        {brand.restrictions.join(" · ") ||
          "Sin restricciones adicionales configuradas"}
      </p>
      <ul aria-label="Claims verificados por el servidor">
        {brand.claims.map((c) => (
          <li key={c.id}>
            {c.text} · Fuentes: {c.sourceKnowledgeIds.join(", ")}
          </li>
        ))}
      </ul>
      <p>
        Configuración del servidor, solo lectura. Un brief o una edición manual
        no agrega claims verificados.
      </p>
    </div>
  );
}
export function EMP003BrandBrain({ tenantId }: { tenantId: string }) {
  const [brand, setBrand] = useState<Brand>();
  const [error, setError] = useState("");
  const [version, setVersion] = useState("");
  useEffect(() => {
    let active = true;
    setBrand(undefined);
    setError("");
    void readBrand(tenantId)
      .then((v) => {
        if (active) setBrand(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [tenantId]);
  async function history() {
    setError("");
    setBrand(undefined);
    try {
      const n = Number(version);
      if (!Number.isSafeInteger(n) || n < 1)
        throw Error("Indicá una versión positiva.");
      setBrand(await readBrand(tenantId, n));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section aria-label="Brand Brain autoritativo">
      <h1>Brand Brain</h1>
      {error && <p role="alert">{error}</p>}
      {brand && <BrandFacts brand={brand} />}
      <label>
        Versión histórica del perfil
        <input
          type="number"
          min="1"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
      </label>
      <button onClick={() => void history()}>Consultar versión de marca</button>
      <p>
        El historial contiene perfiles fijados por operaciones autorizadas.
        Consultar no instala ni modifica configuraciones.
      </p>
    </section>
  );
}
export function EMP003CopyGovernance({
  asset,
  text,
  campaignRevision,
  canWrite,
  canRecover = canWrite,
  onSaved,
  onWorking
}: {
  asset: MarketingAssetVersion;
  text: string;
  campaignRevision: number;
  canWrite: boolean;
  canRecover?: boolean;
  onSaved(record: MarketingAssetVersion): Promise<void>;
  onWorking?(busy: boolean): void;
}) {
  const [brand, setBrand] = useState<Brand>();
  const [approval, setApproval] = useState<Approval>();
  const [draft, setDraft] = useState(text);
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<z.infer<typeof Pending>>();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = `emp003-copy-governance:${asset.tenantId}:${asset.campaignId}:${asset.assetId}`;
  const approvalPath = `/api/emp003/assets/approval?campaignId=${encodeURIComponent(asset.campaignId)}&assetId=${encodeURIComponent(asset.assetId)}&revision=${asset.revision}`;
  const parseApproval = useCallback(
    (
      raw: unknown,
      revision = asset.revision,
      sha256 = asset.sha256
    ): Approval => {
      const p = z
        .object({
          approval: CopyApprovalSchema.nullable(),
          active: z.boolean()
        })
        .parse(raw);
      if (
        p.approval &&
        (p.approval.tenantId !== asset.tenantId ||
          p.approval.campaignId !== asset.campaignId ||
          p.approval.assetId !== asset.assetId ||
          p.approval.revision !== revision ||
          p.approval.sha256 !== sha256)
      )
        throw Error("La aprobación no corresponde a esta revisión.");
      if (p.active && !p.approval) throw Error("Aprobación inválida.");
      return p;
    },
    [asset]
  );

  const readApproval = useCallback(
    async (revision = asset.revision, sha256 = asset.sha256) => {
      const path = approvalPath.replace(
        /revision=\d+$/,
        `revision=${revision}`
      );
      const r = await fetch(path, readOptions);
      if (!r.ok) throw Error("No se pudo recuperar la aprobación exacta.");
      return parseApproval(await r.json(), revision, sha256);
    },
    [approvalPath, asset, parseApproval]
  );

  useEffect(() => {
    let active = true;
    setBrand(undefined);
    setApproval(undefined);
    setDraft(text);
    setAttest(false);
    setError("");
    setNotice("");
    setPending(undefined);
    setLocked(false);
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const p = Pending.parse(JSON.parse(stored));
        if (
          p.body.campaignId !== asset.campaignId ||
          p.body.assetId !== asset.assetId
        )
          throw Error();
        setPending(p);
      }
    } catch {
      setLocked(true);
      setError(
        "No pudimos verificar el identificador pendiente. No se enviarán nuevas operaciones."
      );
    }
    void Promise.all([readBrand(asset.tenantId), readApproval()])
      .then(([b, a]) => {
        if (active) {
          setBrand(b);
          setApproval(a);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
    // The component is keyed by tenant/asset/revision/hash by its parent.
  }, [key, asset, text, readApproval]);
  function clear() {
    sessionStorage.removeItem(key);
    setPending(undefined);
  }
  async function send(operation: z.infer<typeof Pending>, recover = false) {
    if ((recover ? !canRecover : !canWrite) || busy) return;
    setBusy(true);
    onWorking?.(true);
    setError("");
    setNotice("");
    try {
      sessionStorage.setItem(key, JSON.stringify(operation));
      setPending(operation);
      const response = await fetch(`/api/emp003/assets/${operation.kind}`, {
        ...readOptions,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation.body)
      });
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        const code = String(data.error ?? "");
        if (
          (response.status === 409 && code !== "COPY_IDEMPOTENCY_CONFLICT") ||
          response.status === 400
        )
          clear();
        throw Error(explanation(code));
      }
      if (operation.kind === "edit") {
        const record = MarketingAssetVersionSchema.parse(data.record);
        if (
          data.readBackConfirmed !== true ||
          record.tenantId !== asset.tenantId ||
          record.campaignId !== asset.campaignId ||
          record.assetId !== asset.assetId ||
          record.revision !== operation.body.expectedRevision + 1
        )
          throw Error("No se confirmó la nueva revisión del asset.");
        await onSaved(record);
        clear();
        setNotice(
          "Nueva revisión guardada y recuperada. No hereda aprobaciones."
        );
      } else {
        const accepted = CopyApprovalSchema.parse(data.approval);
        if (
          accepted.tenantId !== asset.tenantId ||
          accepted.campaignId !== asset.campaignId ||
          accepted.assetId !== asset.assetId ||
          accepted.revision !== operation.body.revision ||
          accepted.sha256 !== operation.body.sha256 ||
          accepted.contextHash !== operation.body.contextHash ||
          accepted.campaignRevision !== operation.body.campaignRevision
        )
          throw Error("La aprobación no coincide con la revisión solicitada.");
        const independent = await readApproval(
          accepted.revision,
          accepted.sha256
        );
        if (independent.approval?.sha256 !== accepted.sha256)
          throw Error(
            "La aprobación existe, pero su lectura independiente no quedó confirmada."
          );
        if (
          accepted.revision === asset.revision &&
          accepted.sha256 === asset.sha256
        )
          setApproval(independent);
        clear();
        setAttest(false);
        setNotice(
          independent.active
            ? "Revisión exacta aprobada y recuperada. No se publicó contenido."
            : "Aprobación histórica recuperada; no está activa para la revisión actual."
        );
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(
        message === "Failed to fetch"
          ? "Se perdió la respuesta. Conservamos la solicitud para recuperarla sin crear otra operación."
          : message
      );
    } finally {
      setBusy(false);
      onWorking?.(false);
    }
  }
  function next(kind: "edit" | "approve") {
    if (!brand || pending || locked) return;
    const exact = {
      campaignId: asset.campaignId,
      assetId: asset.assetId,
      operationId: crypto.randomUUID(),
      campaignRevision,
      contextRevision: brand.revision,
      contextHash: brand.hash
    };
    if (kind === "edit")
      void send({
        kind,
        body: CopyEditInput.parse({
          ...exact,
          expectedRevision: asset.revision,
          baseSha256: asset.sha256,
          text: draft
        })
      });
    else
      void send({
        kind,
        body: CopyApproveInput.parse({
          ...exact,
          revision: asset.revision,
          sha256: asset.sha256,
          claimsReviewed: true
        })
      });
  }
  return (
    <section aria-label="Edición y aprobación de copy">
      <h3>Edición y aprobación de la revisión {asset.revision}</h3>
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      {brand && <BrandFacts brand={brand} />}
      <p>
        {approval?.active
          ? "Aprobada: esta revisión y hash exactos."
          : "Esta revisión no tiene una aprobación activa confirmada."}
      </p>
      <label>
        Copy para una nueva revisión
        <textarea
          rows={8}
          maxLength={12000}
          value={draft}
          disabled={!canWrite || busy || !!pending || locked}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <p>
        El texto editado es un borrador manual, no una fuente verificada.
        Guardar crea otra revisión, sin consumir IA.
      </p>
      <button
        disabled={
          !canWrite ||
          busy ||
          !brand ||
          !!pending ||
          locked ||
          !draft.trim() ||
          draft === text
        }
        onClick={() => next("edit")}
      >
        Guardar nueva revisión
      </button>
      <label>
        <input
          type="checkbox"
          checked={attest}
          disabled={!canWrite || busy || !!pending || locked}
          onChange={(e) => setAttest(e.target.checked)}
        />
        Verifiqué los hechos y restricciones del texto guardado de esta
        revisión; apruebo su hash exacto.
      </label>
      <button
        disabled={
          !canWrite ||
          busy ||
          !brand ||
          !!pending ||
          locked ||
          !attest ||
          draft !== text ||
          approval?.active
        }
        onClick={() => next("approve")}
      >
        Aprobar revisión exacta
      </button>
      {!canWrite && (
        <p>
          Solo lectura o revisión histórica: no podés editar ni aprobar aquí.
        </p>
      )}
      {pending && (
        <>
          <p>
            Operación pendiente: {pending.body.operationId}. Se conserva la
            solicitud exacta.
          </p>
          <button
            disabled={!canRecover || busy || locked}
            onClick={() => void send(pending, true)}
          >
            Recuperar operación pendiente sin IA
          </button>
        </>
      )}
    </section>
  );
}
