# EMP-002 — Paquete de decisión SECURITY / RELEASE G0

**Fecha:** 30/10/2026. **Estado:** listo para revisión independiente; **no es un GO**.

## 1. Candidato y procedencia

- Base funcional: [PR #321](https://github.com/dito2001-art/herreb-employee-core/pull/321), SHA `19e8ab4671084d0f345831eb6a610363fe55da53`.
- Base auditada: [PR #322 Draft](https://github.com/dito2001-art/herreb-employee-core/pull/322), HEAD `e6257b14ab6674941d44e0bdc3b472f1ca00d74c`, rama `prep/emp002-staging-preflight-20261029`. No se modifica ese HEAD.
- Correctivo: rama `audit/emp002-staging-go-package-20261030`, PR Draft apilado contra #322. El HEAD final se identifica en su descripción y en el CI `Verify exact candidate SHA`. WF-01/WF-04 deben registrar ese SHA completo y la configuración definitiva; si cambian, los dictámenes deben revalidarse.
- No se modifican archivos de EMP-001/003, el Worker general, runtime productivo, secretos ni recursos Cloudflare. Solo entrypoint/manifiesto/tests/CI/documentación de preparación EMP-002.

### Evidencia histórica recuperada, sin repetir #321

| Fuente | Verificación efectuada | Alcance |
|---|---|---|
| [Run #40986429886](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40986429886) | GitHub devolvió SUCCESS y head_sha `19e8ab4…` | Base funcional local #321; no se vuelve a ejecutar |
| [Run #40987796399](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40987796399), [job/logs](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40987796399/job/123842770209) | SUCCESS; 5 tests estáticos, 5 grupos dinámicos y tsc. Logs recuperados completos | Preparación #322, no certificación Cloudflare |
| Checkout en esos logs | `93e02f85adafa407657c7f4243edb9f765f4c9f4`, merge sintético de #322 sobre #321 | No fue checkout directo de e6257b1 |
| [Commit e6257b1](https://github.com/dito2001-art/herreb-employee-core/commit/e6257b14ab6674941d44e0bdc3b472f1ca00d74c) y [commit 93e02f8](https://github.com/dito2001-art/herreb-employee-core/commit/93e02f85adafa407657c7f4243edb9f765f4c9f4) | Ambos API Git Commit devolvieron tree `8482d6b368b23422e949e82bdfc5f4b4ab8d2d48`; padres del merge: #321 y e6257b1 | El PASS anterior corresponde a ese árbol idéntico; no invalida el PASS ni certifica el nuevo árbol corregido |

El workflow correctivo hace checkout explícito del HEAD, verifica `git rev-parse HEAD`, fija las acciones a los SHA observados en el run previo y no persiste credenciales. Job limitado a 10 minutos, contents:read, instalación con scripts deshabilitados y ejecución local únicamente; no wrangler deploy, RPC, cron, secretos ni Meta real. Las versiones resueltas del harness quedan en logs.

## 2. Defectos demostrados y correcciones

Se extendió **el harness de staging de #322**, no el de #321. Sobre el código e6257b1 se observaron, en este orden, estados `[200,200,200,200,200]` donde se exigían `[403,403,403,415,413]`:

| Caso nuevo | Defecto comprobado | Resultado tras corregir |
|---|---|---|
| Identidad role:user → save | El gateway resolvía rol pero no lo aplicaba | 403; lectura del mismo tenant sigue permitida |
| Owner → POST con Origin ajeno | Sin control de origen | 403; se deniega también sec-fetch-site cross-site |
| Stub DO A → header/entry tenant B | La allowlist de rutas no fijaba tenant al objeto | 403; se compara ID real del DO con idFromName del tenant |
| JSON enviado como text/plain | Sin control de tipo de contenido | 415 |
| Cuerpo <64Ki caracteres pero >64Ki bytes UTF-8 | Se medían caracteres, no bytes | 413 |

Además, la matriz antigua seguía describiendo el entrypoint compartido cuando e6257b1 ya usaba el dedicado. Se corrige esa afirmación, se deniegan previews explícitamente en el esqueleto y se elimina el supuesto de que un staging sin versión previa tenga rollback ya probado.

## 3. Evidencia local del correctivo

Comandos afectados, sin servicios remotos:

```bash
node --test tests/emp002-staging-preflight.test.mjs
node tests/emp002-staging-behavior.mjs
npx --no-install tsc --noEmit
```

Resultado local: **5 tests estáticos PASS, 7 grupos de comportamiento PASS, TypeScript PASS**. Node local 24.22.1; Miniflare 4.20260721.0; esbuild 0.28.1; TypeScript 6.0.3. CI usa Node 22 y registra sus versiones efectivas; no se equiparan las dos versiones de Node.

Los 7 grupos son: JWT inválido/no registrado; rutas privilegiadas; SQLite sembrado A/B con lectura/escritura ajenas rechazadas e integridad posterior; rol/origen/DO/JSON/bytes; DO directo outbound rechazado; status sin Meta; interceptor de salida con **cero intentos Meta u otra red**. A/B y reader son identidades RSA locales generadas por el test. No son cuentas Cloudflare ni justifican un Access A/B real PASS. El interceptor es de Miniflare, no un firewall remoto.

La comprobación estática del manifiesto muestra un único DO SQLite. G0 no necesita D1, KV, Queue, CRM, Google ni services; en la configuración definitiva se debe verificar su ausencia efectiva. La migración propuesta crea la clase en namespace nuevo; no migra ni reutiliza producción.

## 4. Alcance que se solicita a WF-01

**SECURITY GO de preflight G0**, únicamente si el revisor valida independientemente:

1. HEAD exacto y CI del correctivo, issuer/AUD/JWKS confiables, rotación de claves, aplicación/políticas Access EMP-002 y mapa actor/rol/tenant aprobado. Dos tenants reales distintos y fixtures provisionados mediante su owner autorizado; no elevar permisos de la identidad B para facilitar pruebas.
2. Cuenta/nombre/namespace/migración/configuración definitiva; sin datos/bindings de producción. Confirmar si se requieren recursos aún no creados y quién puede crearlos, sin atribuirles evidencia efectiva antes de existir.
3. workers.dev/previews/rutas/cron/colas/services y cualquier bypass cerrados. Resolver el transporte privado o gateway Access exacto antes de pedir E2E HTTP. Un Worker sin ingress no tiene URL de prueba implícita; RPC no está autorizado por este documento.
4. Bloqueo Meta por superficie de operaciones, eliminación de credenciales y ausencia de ejecutores. No exigir credenciales Meta sandbox para el G0 que prohíbe Meta; no instalar una variable ficticia de kill switch ni suponer que un mock local protege Cloudflare.
5. Logs y artefactos sanitizados, sin JWT/cookies/secretos/PII, y responsable para responder ante una desviación.

El revisor debe emitir SECURITY GO limitado al plan/configuración exactos o SECURITY NO-GO con evidencia faltante específica. Una preparación aprobada no certifica el entorno desplegado.

## 5. Alcance que se solicita a WF-04

**RELEASE GO de preflight G0**, independiente, únicamente si:

1. El SECURITY GO válido, SHA y configuración coinciden; se comprende la ruptura de pruebas antiguas que trataban role:user como escritor o no fijaban el tenant del DO.
2. El manifiesto definitivo y el circuito de publicación están revisados; el esqueleto NOT-DEPLOYABLE no se usa como permiso de despliegue. No se reactivan Workers Builds, cron o workflows de deploy.
3. Se distingue la primera activación de una actualización: sin versión previa aprobada, ingreso cerrado + preservación SQLite + forward-fix revisado; con versión previa, registrar compatibilidad de esquema y versión de código exactas antes de autorizar rollback. No se revierten datos ni migraciones por defecto.
4. Se asigna operador, read-back posterior de versión/SHA/tree/bindings y stop conditions. Cualquier mismatch detiene el plan; no se registra PASS por una respuesta local o una pantalla de login.
5. La sesión real futura valida calendario persistido/CAS, roles y aislamiento A/B con integridad posterior. Meta execute/claim/reconcile y SENT real están fuera de G0 y requieren otro incremento revisado.

El dictamen debe ser RELEASE GO limitado o RELEASE NO-GO, nunca aprobación funcional completa del Workforce.

## 6. Registro requerido de decisiones

Cada revisor debe dejar un registro verificable en el PR o issue autorizado con: rol WF-01/WF-04; decisión y alcance G0; SHA completo; manifiesto/configuración revisados; enlaces de CI/evidencia; limitaciones/condiciones; acciones que habilita y las que excluye; fecha UTC. Los dos registros deben ser independientes. Este autor no los emite ni atribuye.

**Owner:** después de ambos GO, autorización específica para las acciones concretas de primera activación y, separadamente, la sesión E2E permitida. No se infieren permisos de un “continuá”, de un CI verde ni de un GO anterior sobre otro SHA/empleado.

## 7. Bloqueos exactos al cierre de esta preparación

- Falta HEAD final del correctivo aprobado por ambos revisores y su configuración definitiva; la solicitud antigua de #322 apunta a otro SHA.
- Faltan target real de cuenta/Worker/namespace, política Access/actores A/B, JWKS vigente y transporte privado/protegido revisados específicamente para EMP-002.
- Faltan evidencia efectiva de bindings/ausencia de producción/Meta, publicación y observabilidad; los recursos históricos mencionados en #281 no sustituyen ese read-back.
- Falta plan de primera activación/recuperación firmado por WF-04; no hay rollback remoto demostrado.
- Faltan SECURITY GO, RELEASE GO y autorización owner. Tampoco existe certificación HTTP Cloudflare A/B de este candidato.

**Decisión:** paquete local listo para revisión; **STAGING / SECURITY / RELEASE NO-GO operativo**. Sin merge, deploy, Cloudflare RPC, cron o Meta real. EMP-001/003 no intervenidos.

Documentos complementarios: [matriz](staging-go-dual-evidence-matrix.md), [runbook G0](staging-isolated-acceptance-runbook.md).
