# EMP-002 — staging aislado: preflight y aceptación (NO-GO)

**Base inmutable:** PR #321, SHA `19e8ab4671084d0f345831eb6a610363fe55da53`. Miniflare/workerd local PASS: [run 40986429886](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40986429886). Esta rama es exclusivamente de preparación. **No desplegar** `staging/emp002.wrangler.preflight.jsonc`: es un esqueleto intencionalmente no desplegable, con nombre `NOT-DEPLOYABLE`, tenants vacíos y sin bindings de recursos. No reemplaza el `wrangler.jsonc` productivo.

## Inventario verificado en repositorio

- `wrangler.jsonc` productivo tiene ruta pública `employee.herreb.com`, `EMP002_OPERATIONS` y migración SQLite `v2`; también tiene bindings de ChatAgent, WorkforceAdminState y EMP003CampaignState, además de service bindings a EMP001, SALES_OPS, CRM_CAPABILITY y CALENDAR_READ. **No reutilizar** como manifiesto staging.
- El manifiesto productivo contiene un número Meta real y una lista de propietarios WhatsApp sin `reminderOwnerWhatsapp`. No copiar estos valores a staging.
- `src/runtime/emp002-operations.ts` implementa calendario nativo, `/internal/native-reminders/execute`, `/status`, `/claim`, `/reconcile`; ejecución de recordatorios requiere token interno y tenant nombrado. La prueba local cubre DO SQLite A/B, timeout, duplicados y read-back, no Cloudflare real.
- Recursos staging registrados históricamente por WF-01: gateway `herreb-workforce-staging-gateway`, D1 `herreb-workforce-staging-db`, KV `herreb-workforce-staging-kv` y Queue `herreb-workforce-staging-queue`. **No se verificó read-back efectivo actual ni bindings a EMP-002**. DO staging específico, Access específico y Meta sandbox no certificados.

## Gates obligatorios antes de cualquier despliegue o E2E

1. **WF-01 SECURITY GO escrito**: Worker y versión exactos, SHA, cuenta, Access issuer/AUD/JWKS y reglas deny-by-default, dos actores reales distintos vinculados mediante JWT verificado a tenant A/B, sin bypass por workers.dev, preview, routes, service bindings o WebSocket. Aislamiento de DO SQLite y ausencia de referencia a recursos de producción; revisión de migraciones y políticas.
2. **WF-04 RELEASE GO escrito**, independiente y referido al mismo SHA y configuración, con procedimiento de rollback, stop conditions y auditoría de publicaciones externas. **Autorización explícita del propietario** para el alcance exacto. GO de EMP-003 no es GO de EMP-002.
3. **Inventario/read-back de bindings**: resolver y verificar D1, KV, Queue y DO exclusivos o justificar explícitamente cada recurso no utilizado por el camino EMP-002. El código actual no acredita que EMP-002 requiera D1/KV/Queue directamente: no inventar bindings ni migraciones. Si un service binding se necesita, su destino debe ser staging aislado, nunca EMP001/CRM/CALENDAR_READ productivo.
4. **Manifiesto definitivo revisado**: nombre de Worker staging real, `workers_dev:false`, sin ruta pública ni cron, identidad A/B derivada de Access; `TENANT_MANIFESTS_JSON` con `reminderOwnerWhatsapp` autorizado y único por tenant; rutas WhatsApp sandbox separadas, `META_PHONE_NUMBER_ID` sandbox verificado; token `EMP002_RECONCILIATION_TOKEN` secreto, no en Git. Sin activar Meta hasta autorización separada.
5. **Egress**: la prueba local usa un mock que intercepta `https://graph.facebook.com/` y deniega otros destinos. Staging no hereda automáticamente ese mock: hasta aprobar envío, bloquear outbound y verificar que ninguna ruta/cola/cron produzca mensajes reales.

## Sesión E2E única — ejecutar solamente tras todos los GO

- **Registro**: UTC, SHA/versión Cloudflare, entorno, actor seudonimizado, tenant, id de operación, versión calendario, HTTP status, id de correlación, sin cookies, JWT, teléfonos, mensajes privados ni secretos.
- **A calendario**: crear evento/tarea, GET independiente, modificar con versión esperada, GET nuevo, cancelar, GET confirmando CANCELLED, recargar interfaz. Verificar conflicto y operación idempotente.
- **B aislamiento**: B no puede consultar ni mutar el ID de A por GET/POST; A tampoco B. Verificar denegación de actor sin Access y de token interno inválido, sin exponer recursos.
- **Recordatorios**: primero dry-run sin outbound; confirmar cancel-before sin envío. Con Meta sandbox explícitamente autorizado, ejecutar un único caso controlado, capturar transición PENDING→UNKNOWN→SENT, id de proveedor y `/internal/native-reminders/status` por lectura independiente; concurrencia sin doble envío.
- **Timeout**: introducir fallo *solo en sandbox*, observar UNKNOWN sin reenvío; reconciliación únicamente con evidencia externa autoritativa. Nunca convertir UNKNOWN a PENDING ni reintentar ciegamente.
- **Observabilidad**: logs de estado, versión y correlación, contador de intentos Meta, sin PII; confirmar no hay publicaciones ni tráfico externo inesperado.

## Stop conditions y rollback

**Abortar** ante tenant cruzado, ruta pública, token inválido aceptado, binding a producción, destinatario no autorizado, doble envío, UNKNOWN reintentado, read-back inconsistente o ausencia de evidencia. Deshabilitar tráfico/ejecutor de staging (sin tocar producción), preservar DO SQLite y registros para conciliación; no borrar ni revertir almacenamiento irreversible. Rollback del Worker a versión staging anterior aprobada únicamente tras GO específico y comprobación de compatibilidad de migraciones; documentar versión y read-back posterior. No activar cron ni programador en este gate.

## Decisión vigente

**LOCAL GO / STAGING NO-GO / RELEASE NO-GO.** Pendiente WF-01, WF-04, autorización owner y configuración efectiva. EMP-001/003 NO-GO. No merge, deploy, Cloudflare RPC, cron ni envíos Meta.
