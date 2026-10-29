import { useEffect, useState } from "react";
import { EMP003CampaignDashboard } from "./emp003-campaign-dashboard";
import { EMP003CopyLibrary } from "./emp003-copy-library";
import {
  buildEMP003Workspace,
  type EMP003WorkspaceView
} from "./core/emp003-workspace-view";

const sections = [
  "Control Center",
  "Campañas y aprobaciones",
  "Creative Studio",
  "Calendario"
] as const;
type Section = (typeof sections)[number];
export function EMP003Workspace() {
  const [page, setPage] = useState<Section>("Control Center");
  const [data, setData] = useState<EMP003WorkspaceView>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const response = await fetch("/api/emp003/operations", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok)
          throw Error(
            response.status === 401 || response.status === 403
              ? "Tu sesión o tus permisos no permiten abrir este espacio. Volvé a ingresar."
              : "No se pudo recuperar el espacio. No mostramos datos de demostración."
          );
        const parsed = buildEMP003Workspace(await response.json());
        if (!controller.signal.aborted) setData(parsed);
      } catch {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError(
            "No se pudo verificar el espacio y sus permisos. Volvé a ingresar o intentá actualizar."
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refresh]);
  return (
    <div className="emp003-workspace">
      <header>
        <strong>
          Herre<span>B</span>
        </strong>
        <div>AI Workforce · EMP-003</div>
        <p>Espacio autenticado: {data?.tenantId ?? "Verificando…"}</p>
      </header>
      <nav aria-label="Secciones de marketing">
        {sections.map((section) => (
          <button
            key={section}
            aria-current={page === section ? "page" : undefined}
            onClick={() => setPage(section)}
          >
            {section}
          </button>
        ))}
      </nav>
      <main>
        <p className="emp003-notice">
          Piloto privado · Sin publicaciones externas ni inversión publicitaria.
        </p>
        {loading && <output>Verificando campañas y permisos…</output>}
        {error && <p role="alert">{error}</p>}
        <button disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
          Actualizar resumen y calendario
        </button>
        {data && !error && (
          <div key={data.tenantId}>
            <p>
              Permisos:{" "}
              {data.canWrite ? "Edición y revisión editorial" : "Solo lectura"}.
              El tenant lo determina tu identidad, no un selector del navegador.
            </p>
            <section
              hidden={page !== "Control Center"}
              aria-label="Resumen del espacio"
            >
              <h1>Control Center</h1>
              <p>
                Datos del espacio autenticado. Sin consolidación de otros
                clientes.
              </p>
              <dl>
                <dt>Campañas guardadas</dt>
                <dd>{data.counts.campaigns}</dd>
                <dt>En revisión</dt>
                <dd>{data.counts.inReview}</dd>
                <dt>Aprobadas editorialmente</dt>
                <dd>{data.counts.approved}</dd>
              </dl>
              <p>
                Brand Brain se configura en el servidor. Imágenes, videos,
                métricas, presupuestos y remarketing todavía no están conectados
                a esta interfaz.
              </p>
            </section>
            <section
              hidden={page !== "Campañas y aprobaciones"}
              aria-label="Campañas y aprobaciones conectadas"
            >
              <p>
                Brief, propuesta IA, edición, persistencia y revisión usan los
                servicios existentes. La aprobación de campaña no aprueba
                automáticamente assets ni publicaciones.
              </p>
              <EMP003CampaignDashboard />
            </section>
            <section
              hidden={page !== "Creative Studio"}
              aria-label="Creative Studio conectado"
            >
              <h1>Creative Studio</h1>
              <p>
                Copy real con Workers AI, biblioteca privada y versiones
                verificadas. Creá y guardá primero una campaña en Campañas y
                aprobaciones.
              </p>
              <p>
                La generación requiere una marca, audiencia, oferta y claims
                vinculados por el servidor a la revisión de campaña. No se
                habilita automáticamente para una campaña nueva o editada.
              </p>
              <EMP003CopyLibrary />
            </section>
            <section
              hidden={page !== "Calendario"}
              aria-label="Calendario de campañas"
            >
              <h1>Calendario de campañas</h1>
              <p>
                Fechas planificadas persistidas. No programa publicaciones ni
                envía recordatorios. Para cambiar fechas, editá el borrador en
                Campañas y aprobaciones y actualizá este calendario.
              </p>
              {data.calendar.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Campaña</th>
                      <th>Inicio</th>
                      <th>Fin</th>
                      <th>Estado editorial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.calendar.map((c) => (
                      <tr key={c.campaignId}>
                        <td>{c.name}</td>
                        <td>{c.startDate}</td>
                        <td>{c.endDate}</td>
                        <td>{c.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No hay campañas con fechas planificadas.</p>
              )}
              <p>Campañas sin fechas: {data.unscheduled}</p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
