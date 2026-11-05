import { Emp001Configuration } from "./emp001-configuration";
import { useEffect, useState } from "react";

interface AdminIdentity { email: string; actorId: string; role: "owner" | "user" }
interface AdminTenant {
  tenantId: string;
  enabledEmployees: string[];
  knowledgeNamespace: string;
  offeringNamespace: string;
  identities: AdminIdentity[];
}
interface AdminAuthorization { role: "platform_admin" | "owner"; scope: string }
interface AdminSnapshot {
  tenants: AdminTenant[];
  totals: { tenants: number; identities: number; enabledEmployees: number };
}

export function WorkforceAdminPanel() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot>();
  const [authorization, setAuthorization] = useState<AdminAuthorization>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [configTenant, setConfigTenant] = useState<string | null>(null);
  const [savingTenant, setSavingTenant] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>();
  const [identityFilter, setIdentityFilter] = useState<"all" | "owner" | "user">("all");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/workforce", { headers: { accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { ok: boolean; snapshot?: AdminSnapshot; authorization?: AdminAuthorization; error?: string };
        if (!response.ok || !body.ok || !body.snapshot) throw new Error(body.error ?? `HTTP_${response.status}`);
        if (active) { setSnapshot(body.snapshot); setAuthorization(body.authorization); }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "ADMIN_LOAD_FAILED"); });
    return () => { active = false; };
  }, []);

  async function setPilotEnabled(tenant: AdminTenant, enabled: boolean) {
    if (!authorization || savingTenant) return;
    setSavingTenant(tenant.tenantId);
    setActionMessage(undefined);
    try {
      const next = enabled
        ? [...new Set([...tenant.enabledEmployees, "EMP-001"])]
        : tenant.enabledEmployees.filter((employee) => employee !== "EMP-001");
      const response = await fetch("/api/admin/workforce", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ mutation: { type: "tenant.employees.set", tenantId: tenant.tenantId, enabledEmployees: next } }),
      });
      const result = await response.json() as { ok?: boolean; persisted?: boolean; error?: string };
      if (!response.ok || result.ok !== true || result.persisted !== true) {
        throw new Error(result.error ?? "ADMIN_WRITE_REJECTED");
      }
      // Never trust the write acknowledgement alone: verify through the scoped GET endpoint.
      const check = await fetch("/api/admin/workforce", { headers: { accept: "application/json" }, cache: "no-store" });
      const body = await check.json() as { ok?: boolean; snapshot?: AdminSnapshot; authorization?: AdminAuthorization; error?: string };
      if (!check.ok || body.ok !== true || !body.snapshot) throw new Error(body.error ?? "ADMIN_READBACK_FAILED");
      const persisted = body.snapshot.tenants.find((item) => item.tenantId === tenant.tenantId);
      if (!persisted || persisted.enabledEmployees.includes("EMP-001") !== enabled) throw new Error("ADMIN_READBACK_MISMATCH");
      setSnapshot(body.snapshot);
      setAuthorization(body.authorization);
      setActionMessage(`EMP-001 ${enabled ? "enabled" : "disabled"} for ${tenant.tenantId}; read-back verified.`);
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "ADMIN_UPDATE_FAILED");
    } finally {
      setSavingTenant(null);
    }
  }

  if (error) return <section className="p-4 rounded-xl border"><strong>Workforce Admin</strong><p className="text-sm mt-2">Unavailable: {error}</p></section>;
  if (!snapshot) return <section className="p-4 rounded-xl border"><strong>Workforce Admin</strong><p className="text-sm mt-2">Loading…</p></section>;

  const filteredTenants = snapshot.tenants.filter((tenant) =>
    [tenant.tenantId, ...tenant.enabledEmployees, ...tenant.identities.flatMap((identity) => [identity.email, identity.actorId, identity.role])]
      .some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))
  );

  return (
    <section className="p-4 rounded-xl border space-y-4" aria-label="Workforce Admin">
      <header>
        <h2 className="font-semibold">HerreB AI Workforce Admin</h2>
        <p className="text-sm opacity-70">Tenant registry · controlled EMP-001 activation</p>
        <p className="text-sm mt-1">Verified access: <strong>{authorization ? `${authorization.role} · ${authorization.scope}` : "not reported"}</strong></p>
      </header>
      {actionMessage && <p role="status" className="text-sm p-2 rounded border">{actionMessage}</p>}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div><strong>{snapshot.totals.tenants}</strong><br />Tenants</div>
        <div><strong>{snapshot.totals.identities}</strong><br />Identities</div>
        <div><strong>{snapshot.totals.enabledEmployees}</strong><br />Employees enabled</div>
      </div>
      <label className="block text-sm">Search tenants and identities
        <input className="block w-full mt-1 p-2 rounded-lg border bg-transparent" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tenant, email, actor or employee" />
      </label>
      <p className="text-xs opacity-70">Showing {filteredTenants.length} of {snapshot.totals.tenants} tenants · authenticated access</p>
      {configTenant && <div className="rounded-xl border p-3 space-y-2" aria-label="EMP-001 configuration preview">
        <button type="button" className="underline text-sm" onClick={() => setConfigTenant(null)}>Volver a empresas</button>
        <Emp001Configuration tenantId={configTenant} />
      </div>}
      <div className="space-y-3">
        {filteredTenants.map((tenant) => (
          <article key={tenant.tenantId} className="p-3 rounded-lg border">
            <div className="flex justify-between gap-3"><strong>{tenant.tenantId}</strong><span className="text-xs">{tenant.enabledEmployees.join(" · ")}</span></div>
            {authorization && <button type="button" className="text-sm underline mt-2 mr-4" aria-expanded={configTenant === tenant.tenantId} onClick={() => setConfigTenant(configTenant === tenant.tenantId ? null : tenant.tenantId)}>Configurar vendedor (vista previa)</button>}
            <button type="button" className="text-sm underline mt-2" aria-expanded={expandedTenant === tenant.tenantId} onClick={() => setExpandedTenant(expandedTenant === tenant.tenantId ? null : tenant.tenantId)}>{expandedTenant === tenant.tenantId ? "Hide details" : "View details"}</button>
            {expandedTenant === tenant.tenantId && <div className="mt-2 space-y-1 text-xs">
              <p>Tenant ID: {tenant.tenantId}</p>
              <p>Enabled employees: {tenant.enabledEmployees.length ? tenant.enabledEmployees.join(", ") : "None"}</p>
              <p>Assigned identities: {tenant.identities.length}</p>
              <p>Knowledge: {tenant.knowledgeNamespace}</p>
              <p>Offerings: {tenant.offeringNamespace}</p>
              {authorization && <button
                type="button"
                className="mt-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                disabled={savingTenant !== null}
                onClick={() => void setPilotEnabled(tenant, !tenant.enabledEmployees.includes("EMP-001"))}
              >{savingTenant === tenant.tenantId ? "Saving…" : tenant.enabledEmployees.includes("EMP-001") ? "Disable EMP-001" : "Enable EMP-001"}</button>}
              <p className="opacity-70">Activation changes only the tenant employee flag. Catalog, Meta WhatsApp and live routing require separate certification.</p>
            </div>}
            <div className="mt-3 text-sm">
              <div className="flex items-center gap-2 mb-2"><strong>Users</strong><label className="text-xs">Role <select aria-label="Filter users by role" className="border rounded bg-transparent p-1" value={identityFilter} onChange={(event) => setIdentityFilter(event.target.value as "all" | "owner" | "user")}><option value="all">All</option><option value="owner">Owners</option><option value="user">Users</option></select></label></div>
              {tenant.identities.filter((identity) => identityFilter === "all" || identity.role === identityFilter).map((identity) => <div key={identity.email} className="py-1 border-t"><span className="font-medium">{identity.email}</span><span className="block text-xs opacity-70">Role: {identity.role} · Actor: {identity.actorId}</span></div>)}
              {tenant.identities.filter((identity) => identityFilter === "all" || identity.role === identityFilter).length === 0 && <span className="opacity-60">No matching users</span>}
            </div>
          </article>
        ))}
        {filteredTenants.length === 0 && <p className="text-sm opacity-70">No matching tenants or identities.</p>}
      </div>
    </section>
  );
}
