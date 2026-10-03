import { useEffect, useState } from "react";

interface AdminIdentity { email: string; actorId: string; role: "owner" | "user" }
interface AdminTenant {
  tenantId: string;
  enabledEmployees: string[];
  knowledgeNamespace: string;
  offeringNamespace: string;
  identities: AdminIdentity[];
}
interface AdminSnapshot {
  tenants: AdminTenant[];
  totals: { tenants: number; identities: number; enabledEmployees: number };
}

export function WorkforceAdminPanel() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    fetch("/api/admin/workforce", { headers: { accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { ok: boolean; snapshot?: AdminSnapshot; error?: string };
        if (!response.ok || !body.ok || !body.snapshot) throw new Error(body.error ?? `HTTP_${response.status}`);
        if (active) setSnapshot(body.snapshot);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "ADMIN_LOAD_FAILED"); });
    return () => { active = false; };
  }, []);

  if (error) return <section className="p-4 rounded-xl border"><strong>Workforce Admin</strong><p className="text-sm mt-2">Unavailable: {error}</p></section>;
  if (!snapshot) return <section className="p-4 rounded-xl border"><strong>Workforce Admin</strong><p className="text-sm mt-2">Loading…</p></section>;

  return (
    <section className="p-4 rounded-xl border space-y-4" aria-label="Workforce Admin">
      <header>
        <h2 className="font-semibold">HerreB AI Workforce Admin</h2>
        <p className="text-sm opacity-70">Read-only validated tenant registry</p>
      </header>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div><strong>{snapshot.totals.tenants}</strong><br />Tenants</div>
        <div><strong>{snapshot.totals.identities}</strong><br />Identities</div>
        <div><strong>{snapshot.totals.enabledEmployees}</strong><br />Employees enabled</div>
      </div>
      <div className="space-y-3">
        {snapshot.tenants.map((tenant) => (
          <article key={tenant.tenantId} className="p-3 rounded-lg border">
            <div className="flex justify-between gap-3"><strong>{tenant.tenantId}</strong><span className="text-xs">{tenant.enabledEmployees.join(" · ")}</span></div>
            <p className="text-xs mt-2 opacity-70">Knowledge: {tenant.knowledgeNamespace}</p>
            <p className="text-xs opacity-70">Offerings: {tenant.offeringNamespace}</p>
            <div className="mt-2 text-sm">{tenant.identities.length ? tenant.identities.map((identity) => <div key={identity.email}>{identity.email} · {identity.role} · {identity.actorId}</div>) : <span className="opacity-60">No identities assigned</span>}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
