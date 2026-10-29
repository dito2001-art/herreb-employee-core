const ORDER_STATES = [
  'SALE_CLOSED',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'INVOICE_PENDING',
  'INVOICED',
  'SHIPMENT_PENDING',
  'SHIPPED',
  'CUSTOMER_RECEIPT_PENDING',
  'COMPLETED'
];

const ALLOWED = new Map([
  ['SALE_CLOSED', ['PAYMENT_PENDING']],
  ['PAYMENT_PENDING', ['PAYMENT_CONFIRMED']],
  ['PAYMENT_CONFIRMED', ['INVOICE_PENDING']],
  ['INVOICE_PENDING', ['INVOICED']],
  ['INVOICED', ['SHIPMENT_PENDING']],
  ['SHIPMENT_PENDING', ['SHIPPED']],
  ['SHIPPED', ['CUSTOMER_RECEIPT_PENDING']],
  ['CUSTOMER_RECEIPT_PENDING', ['COMPLETED']],
  ['COMPLETED', []]
]);

function assertTransition(from, to) {
  if (!ORDER_STATES.includes(from) || !ORDER_STATES.includes(to)) {
    throw new Error('UNKNOWN_ORDER_STATE');
  }

  if (!(ALLOWED.get(from) || []).includes(to)) {
    throw new Error(`INVALID_TRANSITION:${from}->${to}`);
  }

  return true;
}

function money(n) {
  return Math.round(Number(n));
}

function quoteLines(productsBySku, requestedLines, customerDiscountPct = 0) {
  const discountPct = Math.max(
    0,
    Math.min(Number(customerDiscountPct || 0), 100)
  );

  const lines = requestedLines.map(({ sku, qty }) => {
    const p = productsBySku[sku];

    if (!p || !p.active) {
      throw new Error(`PRODUCT_NOT_FOUND:${sku}`);
    }

    const q = Number(qty);

    if (!Number.isInteger(q) || q <= 0) {
      throw new Error(`INVALID_QTY:${sku}`);
    }

    if (Number(p.stock_qty) < q) {
      throw new Error(`INSUFFICIENT_STOCK:${sku}`);
    }

    const unit = money(p.price_gs);
    const gross = unit * q;
    const discount = money(gross * discountPct / 100);

    return {
      sku,
      name: p.name,
      qty: q,
      unit_price_gs: unit,
      gross_gs: gross,
      discount_gs: discount,
      line_total_gs: gross - discount
    };
  });

  const total = lines.reduce((s, l) => s + l.line_total_gs, 0);

  return {
    lines,
    discount_pct: discountPct,
    total_gs: total
  };
}

function recommendationScore(product, need) {
  let score = 0;

  const text =
    `${product.name} ${product.description || ''} ${product.category || ''}`
      .toLowerCase();

  const terms = String(need || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(x => x.length > 2);

  for (const t of terms) {
    if (text.includes(t)) score += 2;
  }

  if (Number(product.stock_qty) > 0) score += 1;

  return score;
}

const H = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'Authorization,Content-Type,X-Tenant-ID'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: H
  });

const err = (code, message, status = 400, extra = {}) =>
  json(
    {
      ok: false,
      error: code,
      message,
      ...extra
    },
    status
  );

function credentialTenant(req, env) {
  const supplied = req.headers.get('authorization');
  let credentials;
  try { credentials = JSON.parse(env.SALES_OPS_CREDENTIALS_JSON || '[]'); } catch { return null; }
  if (!Array.isArray(credentials)) return null;
  if (env.EMP001_API_TOKEN && env.EMP001_API_TOKEN_TENANT_ID) credentials.push({ token: env.EMP001_API_TOKEN, tenantId: env.EMP001_API_TOKEN_TENANT_ID });
  if (credentials.some(c => !c || typeof c.token !== 'string' || !c.token || typeof c.tenantId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(c.tenantId))) return null;
  const matches = credentials.filter(c => supplied === `Bearer ${c.token}`);
  return matches.length === 1 ? matches[0].tenantId : null;
}
function auth(req, env) { return Boolean(credentialTenant(req, env)); }

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function now() {
  return new Date().toISOString();
}

async function audit(
  env,
  tenantId,
  actor,
  action,
  entityType,
  entityId,
  payload = {}
) {
  await env.DB.prepare(
    `INSERT INTO audit_log(
      id,
      tenant_id,
      ts,
      actor,
      action,
      entity_type,
      entity_id,
      payload_json
    )
    VALUES(?,?,?,?,?,?,?,?)`
  )
    .bind(
      crypto.randomUUID(),
      tenantId,
      now(),
      actor,
      action,
      entityType,
      entityId,
      JSON.stringify(payload)
    )
    .run();
}

async function tenant(req, env) {
  const id = credentialTenant(req, env);
  if (!id || req.headers.get('x-tenant-id') !== id) return null;

  const row = await env.DB.prepare(
    'SELECT * FROM tenants WHERE id=? AND active=1'
  )
    .bind(id)
    .first();

  return row || null;
}

async function getProducts(env, tenantId) {
  const r = await env.DB.prepare(
    `SELECT *
     FROM products
     WHERE tenant_id=? AND active=1
     ORDER BY name`
  )
    .bind(tenantId)
    .all();

  return r.results || [];
}

async function getCustomer(env, tenantId, id) {
  return await env.DB.prepare(
    'SELECT * FROM customers WHERE tenant_id=? AND id=?'
  )
    .bind(tenantId, id)
    .first();
}

async function getOrder(env, tenantId, id) {
  const o = await env.DB.prepare(
    'SELECT * FROM orders WHERE tenant_id=? AND id=?'
  )
    .bind(tenantId, id)
    .first();

  if (!o) return null;

  const lines = await env.DB.prepare(
    `SELECT *
     FROM order_lines
     WHERE tenant_id=? AND order_id=?`
  )
    .bind(tenantId, id)
    .all();

  return {
    ...o,
    lines: lines.results || []
  };
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const p = u.pathname;
    const m = request.method.toUpperCase();

    if (m === 'OPTIONS') return new Response(null, { status: 204, headers: H });

    if (p === '/health') {
      return json({
        service: 'herreb-emp001-sales-ops-sandbox',
        status: 'ok',
        version: '0.3.0-order-authority-candidate',
        storage: env.DB ? 'D1' : 'missing'
      });
    }

    if (p === '/api/v1/demo/reset') return err('NOT_FOUND', 'Not found', 404);
    if (!auth(request, env)) {
      return err(
        'UNAUTHORIZED',
        'Bearer token required',
        401
      );
    }

    const t = await tenant(request, env);

    if (!t) {
      return err(
        'TENANT_NOT_FOUND',
        'Unknown or inactive tenant',
        404
      );
    }

    const tid = t.id;

    try {
      if (m === 'GET' && p === '/api/v1/tenant-operations') {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tenant_operations (tenant_id TEXT PRIMARY KEY, operations_json TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
        const row = await env.DB.prepare('SELECT operations_json,updated_at FROM tenant_operations WHERE tenant_id=?').bind(tid).first();
        return json({ ok: true, tenant_id: tid, operations: row ? JSON.parse(row.operations_json) : {}, updated_at: row?.updated_at || null });
      }

      if (m === 'PUT' && p === '/api/v1/tenant-operations') {
        const b = await body(request);
        const operations = b?.operations && typeof b.operations === 'object' && !Array.isArray(b.operations) ? b.operations : {};
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS tenant_operations (tenant_id TEXT PRIMARY KEY, operations_json TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
        await env.DB.prepare('INSERT INTO tenant_operations(tenant_id,operations_json,updated_at) VALUES(?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET operations_json=excluded.operations_json,updated_at=excluded.updated_at').bind(tid, JSON.stringify(operations), now()).run();
        await audit(env, tid, 'ADMIN', 'TENANT_OPERATIONS_UPDATED', 'tenant', tid, operations);
        return json({ ok: true, tenant_id: tid, operations });
      }

      if (m === 'GET' && p === '/api/v1/products') {
        const products = await getProducts(env, tid);

        return json({
          ok: true,
          tenant_id: tid,
          products
        });
      }

      if (m === 'GET' && p === '/api/v1/customers') {
        const r = await env.DB.prepare(
          `SELECT *
           FROM customers
           WHERE tenant_id=?
           ORDER BY name`
        )
          .bind(tid)
          .all();

        return json({
          ok: true,
          customers: r.results || []
        });
      }

      if (m === 'POST' && p === '/api/v1/products') {
        const b = await body(request);
        const sku = String(b.sku || '').trim();
        const name = String(b.name || '').trim();
        const price = Number(b.price_gs ?? b.price);
        const stock = Number(b.stock_qty ?? b.stock);
        if (!sku || !name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
          return err('INVALID_PRODUCT', 'sku, name, positive price and non-negative integer stock are required', 422);
        }
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO products(sku, tenant_id, name, description, category, price_gs, stock_qty, active)
           VALUES(?,?,?,?,?,?,?,1)`
        ).bind(id ? sku : sku, tid, name, String(b.description || ''), String(b.category || 'Other'), Math.round(price), stock).run();
        await audit(env, tid, 'ADMIN', 'PRODUCT_CREATED', 'product', sku, { name, price_gs: Math.round(price), stock_qty: stock });
        return json({ ok: true, tenant_id: tid, product: (await env.DB.prepare('SELECT * FROM products WHERE tenant_id=? AND sku=?').bind(tid, sku).first()) }, 201);
      }

      if (m === 'POST' && p === '/api/v1/customers') {
        const b = await body(request);
        const id = String(b.id || crypto.randomUUID()).trim();
        const name = String(b.name || '').trim();
        const phone = String(b.phone || b.whatsapp || '').trim();
        if (!name || !phone) return err('INVALID_CUSTOMER', 'name and phone are required', 422);
        await env.DB.prepare(
          `INSERT INTO customers(id, tenant_id, name, phone, email, address, discount_pct)
           VALUES(?,?,?,?,?,?,?)`
        ).bind(id, tid, name, phone, String(b.email || ''), String(b.address || ''), Number(b.discount_pct || 0)).run();
        await audit(env, tid, 'ADMIN', 'CUSTOMER_CREATED', 'customer', id, { name, phone });
        return json({ ok: true, tenant_id: tid, customer: await getCustomer(env, tid, id) }, 201);
      }

      if (
        m === 'POST' &&
        p === '/api/v1/recommendations'
      ) {
        const b = await body(request);

        const products = await getProducts(env, tid);

        const ranked = products
          .map(x => ({
            ...x,
            score: recommendationScore(x, b.need)
          }))
          .filter(x => x.stock_qty > 0)
          .sort(
            (a, b) =>
              b.score - a.score ||
              a.price_gs - b.price_gs
          )
          .slice(0, 5);

        await audit(
          env,
          tid,
          'EMP-001',
          'RECOMMENDATION_CREATED',
          'customer',
          b.customer_id || 'unknown',
          {
            need: b.need,
            skus: ranked.map(x => x.sku)
          }
        );

        return json({
          ok: true,
          recommendations: ranked
        });
      }

      if (m === 'POST' && p === '/api/v1/quotes') {
        const b = await body(request);

        const c = await getCustomer(
          env,
          tid,
          b.customer_id
        );

        if (!c) {
          return err(
            'CUSTOMER_NOT_FOUND',
            'Customer not found',
            404
          );
        }

        const products = await getProducts(env, tid);

        const map = Object.fromEntries(
          products.map(x => [x.sku, x])
        );

        // Discounts are fail-closed: customer.discount_pct is not a permission.
        // A discount requires both an explicit customer request and an explicit
        // authorization supplied by the business policy layer.
        const discountPct = b.discount_requested === true && b.discount_authorized === true
          ? c.discount_pct || 0
          : 0;
        const q = quoteLines(map, b.lines || [], discountPct);

        const id =
          `Q-${crypto.randomUUID()
            .slice(0, 8)
            .toUpperCase()}`;

        await env.DB.prepare(
          `INSERT INTO quotes(
            id,
            tenant_id,
            customer_id,
            status,
            total_gs,
            created_at,
            quote_json
          )
          VALUES(?,?,?,?,?,?,?)`
        )
          .bind(
            id,
            tid,
            c.id,
            'OPEN',
            q.total_gs,
            now(),
            JSON.stringify(q)
          )
          .run();

        await audit(
          env,
          tid,
          'EMP-001',
          'QUOTE_CREATED',
          'quote',
          id,
          q
        );

        return json(
          {
            ok: true,
            quote: {
              id,
              customer_id: c.id,
              status: 'OPEN',
              ...q
            }
          },
          201
        );
      }

      if (m === 'POST' && p === '/api/v1/orders') {
        const b = await body(request);
        if (!b || typeof b.operation_id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(b.operation_id) || typeof b.quote_id !== 'string' || !b.quote_id) return err('ORDER_OPERATION_REQUIRED', 'Stable operation_id and quote_id required', 400);
        const prior = await env.DB.prepare('SELECT * FROM order_create_operations WHERE tenant_id=? AND operation_id=?').bind(tid, b.operation_id).first();
        if (prior) return prior.quote_id === b.quote_id ? json({ ok: true, replayed: true, order: await getOrder(env, tid, prior.order_id) }) : err('ORDER_OPERATION_CONFLICT', 'Operation was used for another quote', 409);

        const q = await env.DB.prepare(
          `SELECT *
           FROM quotes
           WHERE tenant_id=? AND id=?`
        )
          .bind(tid, b.quote_id)
          .first();

        if (!q) {
          return err(
            'QUOTE_NOT_FOUND',
            'Quote not found',
            404
          );
        }

        if (q.status !== 'OPEN') {
          return err(
            'QUOTE_NOT_OPEN',
            'Quote must be OPEN',
            409
          );
        }

        const data = JSON.parse(q.quote_json);

        const id =
          `O-${crypto.randomUUID()
            .slice(0, 8)
            .toUpperCase()}`;

        const ts = now();

        try { await env.DB.batch([
          env.DB.prepare('INSERT INTO order_create_operations(tenant_id,operation_id,quote_id,order_id) VALUES(?,?,?,?)').bind(tid, b.operation_id, q.id, id),
          env.DB.prepare(
            `INSERT INTO orders(
              id,
              tenant_id,
              customer_id,
              quote_id,
              status,
              total_gs,
              created_at,
              updated_at
            )
            VALUES(?,?,?,?,?,?,?,?)`
          ).bind(
            id,
            tid,
            q.customer_id,
            q.id,
            'PAYMENT_PENDING',
            q.total_gs,
            ts,
            ts
          ),

          env.DB.prepare(
            `UPDATE quotes
             SET status=?
             WHERE tenant_id=? AND id=?`
          ).bind(
            'ACCEPTED',
            tid,
            q.id
          ),

          ...data.lines.flatMap(l => [
            env.DB.prepare(`INSERT INTO order_lines(id,tenant_id,order_id,sku,name,qty,unit_price_gs,line_total_gs) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),tid,id,l.sku,l.name,l.qty,l.unit_price_gs,l.line_total_gs),
            env.DB.prepare('UPDATE products SET stock_qty=stock_qty-? WHERE tenant_id=? AND sku=? AND stock_qty>=?').bind(l.qty,tid,l.sku,l.qty)
          ]),
          env.DB.prepare(`INSERT INTO audit_log(id,tenant_id,ts,actor,action,entity_type,entity_id,payload_json) VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),tid,ts,'EMP-001','ORDER_CREATED','order',id,JSON.stringify({operation_id:b.operation_id,quote_id:q.id,total_gs:q.total_gs,status:'PAYMENT_PENDING'}))
        ]); } catch (cause) {
          const replay = await env.DB.prepare('SELECT * FROM order_create_operations WHERE tenant_id=? AND operation_id=?').bind(tid,b.operation_id).first();
          if (replay) return replay.quote_id === b.quote_id ? json({ok:true,replayed:true,order:await getOrder(env,tid,replay.order_id)}) : err('ORDER_OPERATION_CONFLICT','Operation was used for another quote',409);
          const usedQuote = await env.DB.prepare('SELECT order_id FROM order_create_operations WHERE tenant_id=? AND quote_id=?').bind(tid,q.id).first();
          if (usedQuote) return err('QUOTE_ALREADY_ORDERED','Quote already has an order',409);
          if (String(cause).includes('INSUFFICIENT_STOCK')) return err('INSUFFICIENT_STOCK','Stock changed; request a new quote',409);
          return err('ORDER_WRITE_FAILED','Order not confirmed; retry with the same operation_id',503);
        }

        return json(
          {
            ok: true,
            order: await getOrder(
              env,
              tid,
              id
            )
          },
          201
        );
      }

      const stateMatch = p.match(
        /^\/api\/v1\/orders\/([^/]+)\/state$/
      );

      if (m === 'POST' && stateMatch) {
        const id = stateMatch[1];

        const b = await body(request);

        const o = await getOrder(
          env,
          tid,
          id
        );

        if (!o) {
          return err(
            'ORDER_NOT_FOUND',
            'Order not found',
            404
          );
        }

        const target =
          String(b.status || '').toUpperCase();

        assertTransition(
          o.status,
          target
        );

        const evidence =
          b.evidence || null;

        const evidenceRequired = [
          'PAYMENT_CONFIRMED',
          'INVOICED',
          'SHIPPED',
          'COMPLETED'
        ].includes(target);

        if (
          evidenceRequired &&
          !evidence
        ) {
          return err(
            'EVIDENCE_REQUIRED',
            `Evidence required for ${target}`,
            422
          );
        }

        const changedAt = now();
        const transition = await env.DB.batch([
          env.DB.prepare(
            `UPDATE orders SET status=?, updated_at=?, evidence_json=?
             WHERE tenant_id=? AND id=? AND status=?`
          ).bind(target, changedAt, evidence ? JSON.stringify(evidence) : o.evidence_json, tid, id, o.status),
          // changes() observes the preceding CAS inside the same D1 batch.
          // A losing writer must not create an audit event for an unapplied state.
          env.DB.prepare(
            `INSERT INTO audit_log(id,tenant_id,ts,actor,action,entity_type,entity_id,payload_json)
             SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`
          ).bind(crypto.randomUUID(), tid, changedAt, b.actor || 'AUTHORIZED_HUMAN',
            `ORDER_STATE_${target}`, 'order', id,
            JSON.stringify({ from: o.status, to: target, evidence }))
        ]);
        const changed = transition[0]?.meta?.changes ?? transition[0]?.changes;
        if (changed !== 1) return err('ORDER_STATE_CONFLICT', 'Order changed; read it again before confirming', 409);

        return json({
          ok: true,
          order: await getOrder(
            env,
            tid,
            id
          )
        });
      }

      const orderMatch = p.match(
        /^\/api\/v1\/orders\/([^/]+)$/
      );

      if (m === 'GET' && orderMatch) {
        const o = await getOrder(
          env,
          tid,
          orderMatch[1]
        );

        return o
          ? json({
              ok: true,
              order: o
            })
          : err(
              'ORDER_NOT_FOUND',
              'Order not found',
              404
            );
      }

      if (
        m === 'GET' &&
        p === '/api/v1/orders'
      ) {
        const r = await env.DB.prepare(
          `SELECT *
           FROM orders
           WHERE tenant_id=?
           ORDER BY created_at DESC`
        )
          .bind(tid)
          .all();

        return json({
          ok: true,
          orders: r.results || []
        });
      }

      if (
        m === 'GET' &&
        p === '/api/v1/audit'
      ) {
        const r = await env.DB.prepare(
          `SELECT *
           FROM audit_log
           WHERE tenant_id=?
           ORDER BY ts DESC
           LIMIT 200`
        )
          .bind(tid)
          .all();

        return json({
          ok: true,
          audit: r.results || []
        });
      }

      if (
        m === 'POST' &&
        p === '/api/v1/demo/reset'
      ) {
        await env.DB.batch([
          env.DB.prepare(
            `DELETE FROM audit_log
             WHERE tenant_id=?`
          ).bind(tid),

          env.DB.prepare(
            `DELETE FROM order_lines
             WHERE tenant_id=?`
          ).bind(tid),

          env.DB.prepare(
            `DELETE FROM orders
             WHERE tenant_id=?`
          ).bind(tid),

          env.DB.prepare(
            `DELETE FROM quotes
             WHERE tenant_id=?`
          ).bind(tid),

          env.DB.prepare(
            `UPDATE products
             SET stock_qty=
               CASE sku
                 WHEN 'SPK-001' THEN 24
                 WHEN 'WINE-001' THEN 40
                 WHEN 'BEER-001' THEN 60
                 WHEN 'GIN-001' THEN 18
                 ELSE stock_qty
               END
             WHERE tenant_id=?`
          ).bind(tid)
        ]);

        await audit(
          env,
          tid,
          'SYSTEM',
          'DEMO_RESET',
          'tenant',
          tid,
          {}
        );

        return json({
          ok: true,
          reset: true
        });
      }

      return err(
        'NOT_FOUND',
        'Route not found',
        404
      );

    } catch (e) {
      const msg =
        e?.message || String(e);

      if (
        msg.startsWith(
          'INVALID_TRANSITION'
        )
      ) {
        return err(
          'INVALID_TRANSITION',
          msg,
          409
        );
      }

      if (
        msg.startsWith(
          'INSUFFICIENT_STOCK'
        )
      ) {
        return err(
          'INSUFFICIENT_STOCK',
          msg,
          409
        );
      }

      if (
        msg.startsWith(
          'PRODUCT_NOT_FOUND'
        ) ||
        msg.startsWith(
          'INVALID_QTY'
        )
      ) {
        return err(
          'QUOTE_INVALID',
          msg,
          422
        );
      }

      return err(
        'INTERNAL_ERROR',
        msg,
        500
      );
    }
  }
};
