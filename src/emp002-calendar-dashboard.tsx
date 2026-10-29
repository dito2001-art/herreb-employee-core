import { useEffect, useState } from "react";
import { z } from "zod";
import {
  WORKFORCE_TIMEZONE,
  workforceLocalTime,
  workforceInstant,
  workforceCalendarWindow
} from "./core/workforce-calendar-time";
const entrySchema = z.object({
  tenantId: z.string(),
  id: z.string(),
  kind: z.enum(["TASK", "MEETING", "EVENT"]),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().optional(),
  reminderAt: z.string().optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]),
  updatedAt: z.string(),
  version: z.number().int().positive()
});
type Entry = z.infer<typeof entrySchema>;
const local = workforceLocalTime;
const display = (value: string) =>
  new Date(value).toLocaleString("es-PY", { timeZone: WORKFORCE_TIMEZONE });
const failure = (status: number) =>
  status === 409
    ? "Hay un conflicto de horario o la entrada cambió. Recargá antes de guardar."
    : status === 403 || status === 401
      ? "No tenés permiso para esta operación."
      : "No se confirmó la operación. Recargá para verificar su estado antes de reintentar.";
async function call(input: unknown) {
  const response = await fetch("/api/emp002/calendar", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(failure(response.status));
  return response.json();
}
export function EMP002CalendarDashboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reminders, setReminders] = useState<Entry[]>([]);
  const [reminderError, setReminderError] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [date, setDate] = useState(() => local(new Date()).slice(0, 10));
  const [draft, setDraft] = useState({
    id: "",
    kind: "MEETING" as Entry["kind"],
    title: "",
    startsAt: "",
    endsAt: "",
    reminderAt: "",
    version: 0
  });
  const [busy, setBusy] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const read = async (selected: string) => {
    const { from, to } = workforceCalendarWindow(selected);
    return z
      .object({
        ok: z.literal(true),
        tenantId: z.string(),
        canWrite: z.boolean(),
        entries: z.array(entrySchema)
      })
      .parse(
        await call({
          operation: "list",
          from,
          to
        })
      );
  };
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = z
          .object({ ok: z.literal(true), entries: z.array(entrySchema) })
          .parse(await call({ operation: "reminders" }));
        if (active) {
          setReminders(data.entries);
          setReminderError("");
        }
      } catch {
        if (active) {
          setReminders([]);
          setReminderError("No se pudieron cargar los recordatorios.");
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setCanWrite(false);
    setEntries([]);
    setError("");
    void read(date)
      .then((data) => {
        if (active) {
          setEntries(data.entries);
          setCanWrite(data.canWrite);
        }
      })
      .catch((e) => {
        if (active) {
          setCanWrite(false);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [date]);
  async function reload() {
    setBusy(true);
    setError("");
    setCanWrite(false);
    setEntries([]);
    setReminders([]);
    try {
      const data = await read(date);
      setEntries(data.entries);
      setReminders(
        z
          .object({ entries: z.array(entrySchema) })
          .parse(await call({ operation: "reminders" })).entries
      );
      setCanWrite(data.canWrite);
      setDraft({
        id: "",
        kind: "MEETING",
        title: "",
        startsAt: "",
        endsAt: "",
        reminderAt: "",
        version: 0
      });
      setReloadRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setBusy(false);
    }
  }
  async function save(cancel = false) {
    if (!canWrite || busy || reloadRequired) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const entry = {
        id: draft.id || crypto.randomUUID(),
        kind: draft.kind,
        title: draft.title.trim(),
        startsAt: workforceInstant(draft.startsAt),
        ...(draft.endsAt ? { endsAt: workforceInstant(draft.endsAt) } : {}),
        ...(draft.reminderAt
          ? { reminderAt: workforceInstant(draft.reminderAt) }
          : {}),
        status: cancel ? "CANCELLED" : "ACTIVE"
      };
      const receipt = z
        .object({
          ok: z.literal(true),
          readBackConfirmed: z.literal(true),
          entry: entrySchema
        })
        .parse(
          await call({
            operation: "save",
            entry,
            expectedVersion: draft.version
          })
        );
      const get = z
        .object({ ok: z.literal(true), entry: entrySchema })
        .parse(await call({ operation: "get", id: receipt.entry.id }));
      if (JSON.stringify(get.entry) !== JSON.stringify(receipt.entry))
        throw new Error("La lectura posterior no coincide.");
      const data = await read(date);
      setEntries(data.entries);
      setReminders(
        z
          .object({ entries: z.array(entrySchema) })
          .parse(await call({ operation: "reminders" })).entries
      );
      setDraft({
        id: "",
        kind: "MEETING",
        title: "",
        startsAt: "",
        endsAt: "",
        reminderAt: "",
        version: 0
      });
      setNotice(
        cancel
          ? "Cancelación guardada y verificada."
          : "Entrada guardada y verificada."
      );
    } catch (e) {
      setReloadRequired(true);
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setBusy(false);
    }
  }
  function edit(entry: Entry) {
    setDraft({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      startsAt: local(entry.startsAt),
      endsAt: entry.endsAt ? local(entry.endsAt) : "",
      reminderAt: entry.reminderAt ? local(entry.reminderAt) : "",
      version: entry.version
    });
    setNotice("");
  }
  return (
    <section className="space-y-4" aria-label="EMP-002 Agenda y tareas">
      <h1 className="text-2xl font-bold">Agenda y tareas · EMP-002</h1>
      <p>
        Calendario nativo de Workforce. Mostrando 31 días desde la fecha
        elegida. Todos los horarios son de Asunción.
      </p>
      <label>
        Desde
        <input
          type="date"
          value={date}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
      </label>
      <button disabled={busy} onClick={() => void reload()}>
        Recargar
      </button>
      {busy && <output>Procesando…</output>}
      {error && <p role="alert">{error}</p>}
      {notice && <output>{notice}</output>}
      <aside
        className="rounded border p-3 space-y-2"
        aria-label="Recordatorios nativos"
      >
        <h2 className="font-semibold">Recordatorios</h2>
        <p>
          Se actualizan cada minuto mientras el portal está abierto. No se
          envían mensajes externos.
        </p>
        {reminderError && <p role="alert">{reminderError}</p>}
        {reminders.map((entry) => (
          <p key={entry.id}>
            {entry.title} · {display(entry.reminderAt!)}
            {canWrite && (
              <button
                disabled={busy || reloadRequired}
                onClick={() => edit(entry)}
              >
                Editar o quitar recordatorio
              </button>
            )}
          </p>
        ))}
      </aside>
      <ul>
        {entries.map((entry) => (
          <li className="rounded border p-3" key={entry.id}>
            <strong>{entry.title}</strong> ·{" "}
            {entry.kind === "TASK" ? "Tarea" : "Reunión / evento"} ·{" "}
            {display(entry.startsAt)}{" "}
            {canWrite && (
              <button
                disabled={busy || reloadRequired}
                onClick={() => edit(entry)}
              >
                Editar
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form
          className="space-y-3 rounded border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{draft.id ? "Editar entrada" : "Nueva entrada"}</h2>
          <label className="block">
            Tipo
            <select
              value={draft.kind}
              disabled={busy || reloadRequired}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  kind: e.target.value as Entry["kind"]
                }))
              }
            >
              <option value="MEETING">Reunión</option>
              <option value="TASK">Tarea</option>
              <option value="EVENT">Evento</option>
            </select>
          </label>
          <label className="block">
            Título
            <input
              required
              value={draft.title}
              disabled={busy || reloadRequired}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
            />
          </label>
          <label className="block">
            Inicio
            <input
              required
              type="datetime-local"
              value={draft.startsAt}
              disabled={busy || reloadRequired}
              onChange={(e) =>
                setDraft((d) => ({ ...d, startsAt: e.target.value }))
              }
            />
          </label>
          <label className="block">
            Fin
            <input
              required={draft.kind !== "TASK"}
              type="datetime-local"
              value={draft.endsAt}
              disabled={busy || reloadRequired}
              onChange={(e) =>
                setDraft((d) => ({ ...d, endsAt: e.target.value }))
              }
            />
          </label>
          <label className="block">
            Recordatorio (hora de Asunción, opcional)
            <input
              type="datetime-local"
              value={draft.reminderAt}
              disabled={busy || reloadRequired}
              onChange={(e) =>
                setDraft((d) => ({ ...d, reminderAt: e.target.value }))
              }
            />
          </label>
          {draft.reminderAt && (
            <button
              type="button"
              disabled={busy || reloadRequired}
              onClick={() => setDraft((d) => ({ ...d, reminderAt: "" }))}
            >
              Quitar recordatorio
            </button>
          )}
          <button disabled={busy || reloadRequired} type="submit">
            Guardar y verificar
          </button>
          {draft.id && (
            <button
              disabled={busy || reloadRequired}
              type="button"
              onClick={() => void save(true)}
            >
              Cancelar entrada
            </button>
          )}
        </form>
      )}
    </section>
  );
}
