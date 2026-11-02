import { useState } from "react";
import { z } from "zod";
type Product = { sku: string; name: string; priceGs: number; stock: number };
type Order = {
  id: string;
  status: string;
  totalGs: number;
  createdAt: string;
  lines: {
    sku: string;
    quantity: number;
    unitPriceGs: number;
    totalGs: number;
  }[];
};
const amount = z.number().finite().nonnegative();
const productSchema = z.object({
  sku: z.string(),
  name: z.string(),
  priceGs: amount,
  stock: amount
});
const orderSchema = z.object({
  id: z.string(),
  status: z.string(),
  totalGs: amount,
  createdAt: z.string(),
  lines: z.array(
    z.object({
      sku: z.string(),
      quantity: amount.positive(),
      unitPriceGs: amount,
      totalGs: amount
    })
  )
});
const money = (n: number) => new Intl.NumberFormat("es-PY").format(n) + " Gs";
export function EMP001SalesDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  async function read(kind: "catalog" | "order") {
    setBusy(true);
    setError("");
    if (kind === "order") setOrder(null);
    else {
      setProducts([]);
      setLoaded(false);
    }
    try {
      const response = await fetch(
        "/api/emp001/operations" +
          (kind === "order"
            ? "?orderId=" + encodeURIComponent(orderId.trim())
            : ""),
        { cache: "no-store", credentials: "same-origin" }
      );
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "No se encontró ese pedido en tu cuenta."
            : response.status === 403
              ? "Ventas todavía no está habilitado para tu cuenta."
              : response.status === 401
                ? "Iniciá sesión para consultar ventas."
                : "No pudimos confirmar la lectura en Sales Ops. Volvé a consultar."
        );
      const data: unknown = await response.json();
      if (kind === "order")
        setOrder(
          z.object({ ok: z.literal(true), order: orderSchema }).parse(data)
            .order
        );
      else {
        setProducts(
          z
            .object({ ok: z.literal(true), products: z.array(productSchema) })
            .parse(data).products
        );
        setLoaded(true);
      }
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? "No pudimos validar la respuesta. Volvé a consultar."
          : e instanceof Error
            ? e.message
            : "No pudimos completar la consulta."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 text-kumo-default">
      <h1 className="text-xl font-semibold">EMP-001 · Ventas</h1>
      <p>
        Las conversaciones y ventas se realizan por WhatsApp Meta. Acá podés
        consultar el catálogo y comprobar el pedido guardado por el vendedor.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <output>Consultando Sales Ops…</output>}
      <button
        disabled={busy}
        onClick={() => void read("catalog")}
        className="border rounded px-3 py-2"
      >
        Consultar catálogo
      </button>
      {loaded && products.length === 0 && (
        <p>No hay productos activos en tu catálogo.</p>
      )}
      {products.map((product) => (
        <article key={product.sku} className="border rounded p-3">
          <strong>{product.name}</strong>
          <p>
            {product.sku} · {money(product.priceGs)} · Disponible:{" "}
            {product.stock}
          </p>
        </article>
      ))}
      <div className="space-y-2">
        <h2 className="font-semibold">Comprobar un pedido</h2>
        <label className="block">
          ID del pedido{" "}
          <input
            value={orderId}
            disabled={busy}
            onChange={(e) => {
              setOrderId(e.target.value);
              setOrder(null);
            }}
            maxLength={200}
            className="border rounded p-2"
          />
        </label>
        <button
          disabled={busy || !orderId.trim()}
          onClick={() => void read("order")}
          className="border rounded px-3 py-2"
        >
          Recuperar desde Sales Ops
        </button>
      </div>
      {order && (
        <article className="border rounded p-3 space-y-2">
          <output>
            Pedido recuperado mediante una consulta independiente.
          </output>
          <h2 className="font-semibold">{order.id}</h2>
          <p>
            Estado: {order.status} · Total: {money(order.totalGs)}
          </p>
          {order.lines.map((line, i) => (
            <p key={i}>
              {line.sku} · {line.quantity} × {money(line.unitPriceGs)} ={" "}
              {money(line.totalGs)}
            </p>
          ))}
        </article>
      )}
    </section>
  );
}
