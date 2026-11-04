import { useState } from "react";

/**
 * EMP-001 configuration shell. All fields are explicitly read-only until the
 * tenant-scoped, authenticated configuration API is integrated.
 * This component does not store secrets, invent persistence or enable a live agent.
 */
type Tab = "seller" | "knowledge" | "sales" | "team" | "connections";
const tabs: { id: Tab; label: string }[] = [
  { id: "seller", label: "Mi vendedor" },
  { id: "knowledge", label: "Conocimiento" },
  { id: "sales", label: "Ventas" },
  { id: "team", label: "Equipo" },
  { id: "connections", label: "Conexiones" },
];

function Item({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border p-4 space-y-1"><h3 className="font-semibold">{title}</h3><p className="text-sm opacity-70">{detail}</p></div>;
}

export function Emp001Configuration({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<Tab>("seller");
  const validTenant = /^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId);
  if (!validTenant) return <section role="alert">Identificador de empresa inválido.</section>;

  return <section aria-label="Configuración de EMP-001" className="mx-auto max-w-5xl p-5 space-y-5">
    <header className="space-y-1">
      <p className="text-xs uppercase tracking-widest opacity-60">HerreB Workforce</p>
      <h1 className="text-2xl font-semibold">Configurar vendedor IA</h1>
      <p className="text-sm opacity-70">Empresa: {tenantId}</p>
      <p role="status" className="rounded-lg border p-3 text-sm">Vista preliminar. La configuración comercial todavía no está conectada al backend; no se pueden guardar ni activar cambios desde esta pantalla.</p>
    </header>
    <nav aria-label="Secciones de configuración" className="flex flex-wrap gap-2">
      {tabs.map(({ id, label }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined}
        onClick={() => setTab(id)} className={`rounded-lg border px-3 py-2 text-sm ${tab === id ? "font-bold bg-neutral-200 text-black" : ""}`}>{label}</button>)}
    </nav>
    <div role="region" aria-label={tabs.find(x => x.id === tab)?.label} className="grid gap-3 md:grid-cols-2">
      {tab === "seller" && <>
        <Item title="Identidad" detail="Nombre visible del vendedor y presentación a los clientes." />
        <Item title="Personalidad" detail="Profesional y cercano, formal o amigable y directo." />
        <Item title="Objetivo" detail="Cerrar ventas o generar oportunidades para el equipo." />
      </>}
      {tab === "knowledge" && <>
        <Item title="Catálogo" detail="SKU, descripción, fotos, medidas, materiales, precio y stock." />
        <Item title="Negocio" detail="Horarios, ubicaciones, garantías y preguntas frecuentes." />
        <Item title="Documentos" detail="Fichas técnicas y políticas aprobadas." />
      </>}
      {tab === "sales" && <>
        <Item title="Reglas comerciales" detail="Precios, descuentos máximos y promociones autorizadas." />
        <Item title="Venta adicional" detail="Cuándo recomendar productos complementarios." />
        <Item title="Cierre" detail="Cotizar, crear pedido y solicitar confirmación humana cuando corresponda." />
      </>}
      {tab === "team" && <>
        <Item title="Responsable principal" detail="Recibe pedidos y situaciones excepcionales." />
        <Item title="Tesorería" detail="Verifica pagos; la IA no declara un cobro sin evidencia." />
        <Item title="Logística" detail="Coordina retiro, envío y entrega." />
        <Item title="Catálogo" detail="Aclara características y disponibilidad." />
      </>}
      {tab === "connections" && <>
        <Item title="WhatsApp" detail="Canal de EMP-001 V1. Requiere autorización y verificación del número." />
        <Item title="Instagram Direct" detail="Reservado para la siguiente versión; no habilitado en V1." />
      </>}
    </div>
    <footer className="flex flex-wrap gap-3 items-center border-t pt-4">
      <button type="button" disabled title="Pendiente de API y persistencia verificadas" className="rounded-lg border px-4 py-2 opacity-50">Guardar configuración</button>
      <button type="button" disabled title="Pendiente de simulador aislado real" className="rounded-lg border px-4 py-2 opacity-50">Probar vendedor</button>
      <button type="button" disabled title="Pendiente de validaciones y aprobación" className="rounded-lg border px-4 py-2 opacity-50">Activar vendedor</button>
      <span className="text-xs opacity-60">Sin cambios en el vendedor operativo.</span>
    </footer>
  </section>;
}
