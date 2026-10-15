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
        <p className="text-sm opacity-70">Read-only validated tenant registry</p>
        <p className="text-sm mt-1">Verified access: <strong>{authorization ? `${authorization.role} · ${authorization.scope}` : "not reported"}</strong></p>
      </header>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div><strong>{snapshot.totals.tenants}</strong><br />Tenants</div>
        <div><strong>{snapshot.totals.identities}</strong><br />Identities</div>
        <div><strong>{snapshot.totals.enabledEmployees}</strong><br />Employees enabled</div>
      </div>
      <label className="block text-sm">Search tenants and identities
        <input className="block w-full mt-1 p-2 rounded-lg border bg-transparent" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tenant, email, actor or employee" />
      </label>
      <p className="text-xs opacity-70">Showing {filteredTenants.length} of {snapshot.totals.tenants} tenants · read-only</p>
      <div className="space-y-3">
        {filteredTenants.map((tenant) => (
          <article key={tenant.tenantId} className="p-3 rounded-lg border">
            <div className="flex justify-between gap-3"><strong>{tenant.tenantId}</strong><span className="text-xs">{tenant.enabledEmployees.join(" · ")}</span></div>
            <p className="text-xs mt-2 opacity-70">Knowledge: {tenant.knowledgeNamespace}</p>
            <p className="text-xs opacity-70">Offerings: {tenant.offeringNamespace}</p>
            <div className="mt-2 text-sm">{tenant.identities.length ? tenant.identities.map((identity) => <div key={identity.email}>{identity.email} · {identity.role} · {identity.actorId}</div>) : <span className="opacity-60">No identities assigned</span>}</div>
          </article>
        ))}
        {filteredTenants.length === 0 && <p className="text-sm opacity-70">No matching tenants or identities.</p>}
      </div>
    </section>
  );
}
