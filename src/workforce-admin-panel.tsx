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
            <button type="button" className="text-sm underline mt-2" aria-expanded={expandedTenant === tenant.tenantId} onClick={() => setExpandedTenant(expandedTenant === tenant.tenantId ? null : tenant.tenantId)}>{expandedTenant === tenant.tenantId ? "Hide details" : "View details"}</button>
            {expandedTenant === tenant.tenantId && <div className="mt-2 space-y-1 text-xs">
              <p>Tenant ID: {tenant.tenantId}</p>
              <p>Enabled employees: {tenant.enabledEmployees.length ? tenant.enabledEmployees.join(", ") : "None"}</p>
              <p>Assigned identities: {tenant.identities.length}</p>
              <p>Knowledge: {tenant.knowledgeNamespace}</p>
              <p>Offerings: {tenant.offeringNamespace}</p>
              <p className="opacity-70">Management actions unavailable until controlled-write certification.</p>
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
