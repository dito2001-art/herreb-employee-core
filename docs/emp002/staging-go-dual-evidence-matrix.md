# EMP-002 — Matriz de evidencia para GO dual

Base de código: PR #321 SHA `19e8ab4671084d0f345831eb6a610363fe55da53`. Preparación: PR #322. Fecha de corte: 2026-10-30 UTC.

| Gate | Evidencia disponible | Falta para GO | Responsable | Dictamen |
|---|---|---|---|---|
| DO real local | [Miniflare #40986429886](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40986429886), 5 grupos PASS, 14 Node PASS, tsc PASS | No repetir; no sustituye Cloudflare real | WF-02 | LOCAL GO |
| Identidad A/B | Harness usa tenants A/B sintéticos; sin Access real | issuer/AUD/JWKS, actores reales separados, JWT validado, pruebas deny-by-default | WF-01 | NO-GO |
| DO SQLite staging | `EMP002Operations` y migración SQLite `new_sqlite_classes` en esqueleto | DO staging real exclusivo, migración compatible, bindings efectivos y read-back | WF-01 | NO-GO |
| D1/KV/Queue | Recursos staging mencionados en Issue #281; no evidencia de uso directo obligatorio en ruta de recordatorios | inventario de dependencias y bindings efectivos; no agregar recursos innecesarios | WF-01 | NO-GO |
| Service bindings | Producción referencia EMP001, SALES_OPS, CRM_CAPABILITY, CALENDAR_READ | no conectar destinos productivos; identificar cuáles necesita el E2E y sustituir por staging autorizado | WF-01/WF-04 | NO-GO |
| Calendario nativo | API y pruebas de código existentes | crear/editar/consultar/cancelar, reload y GET independiente con identidad Access real | WF-02 | NO-GO |
| Recordatorios | Miniflare: cancel-before, concurrency, UNKNOWN timeout, cancel-after, SENT read-back, A/B PASS | repetir solo E2E staging autorizado; verificar persistencia y respuesta real | WF-02 | NO-GO |
| Meta sandbox | Mock local, cero Meta real | cuenta/número sandbox, destinatarios autorizados, bloqueo efectivo de egress hasta autorización explícita | WF-01/WF-02 | NO-GO |
| Reconciliación | `/internal/native-reminders/status` y `/reconcile` existentes | evidencia autoritativa externa antes de reconciliar UNKNOWN; operador y auditoría | WF-02/WF-04 | NO-GO |
| Observabilidad | Wrangler productivo tiene observabilidad; esqueleto la declara | logs efectivos sanitizados, correlación, conteos y stop conditions | WF-01/WF-04 | NO-GO |
| Rollback | Procedimiento documentado en runbook | versión staging previa verificable, compatibilidad migraciones SQLite, read-back post-rollback | WF-04 | NO-GO |
| GO dual | Solicitud [PR #322](https://github.com/dito2001-art/herreb-employee-core/pull/322#issuecomment-6512787813) | SECURITY GO escrito WF-01 + RELEASE GO escrito WF-04 sobre SHA y entorno exactos + autorización owner | WF-01/WF-04/Owner | NO-GO |

**Control crítico:** no existe evidencia de que una variable `EMP002_STAGING_SEND_DISABLED` bloquee outbound; fue retirada del esqueleto. La prevención efectiva exige no desplegar, no exponer rutas y, cuando se autorice un staging, controlar explícitamente el egress y el ejecutor. Ningún GO de EMP-003 sirve para EMP-002.

**Decisión:** LOCAL GO, STAGING NO-GO, RELEASE NO-GO. EMP-001/003 NO-GO. Sin merge, deploy, RPC Cloudflare, cron ni Meta real.

## Hallazgo estático bloqueante — entrypoint compartido

El esqueleto `staging/emp002.wrangler.preflight.jsonc` referencia `../src/worker.ts`, el entrypoint compartido de producción. Auditoría del código en SHA base: `src/worker.ts` también maneja `/api/internal/emp003/*`, `/api/internal/emp002/north-star/*`, `/api/internal/emp002/e2e` y `/webhooks/*`. **`workers_dev:false` y `routes:[]` no prueban que esas rutas estén inaccesibles por service bindings, previews o futuras rutas.** El esqueleto no es apto para deploy ni para autorización de staging.

**Acción WF-02 antes de solicitar GO:** diseñar entrypoint exclusivo EMP-002 con allowlist explícita de operaciones autorizadas, autenticación Access verificada en el borde y denegación de rutas ajenas. Asegurar que ninguna llamada de prueba alcance Meta sin mock/egress guard efectivo. Auditar `src/worker.ts` y sus handlers; no asumir que `ACCESS_IDENTITY_MAP_JSON` vacío constituye un control suficiente.

**Acción WF-01:** certificar por lectura los caminos de acceso efectivos, incluida invocación M2M y previews, y validar el entrypoint exclusivo y sus bindings; sin esta evidencia, SECURITY NO-GO.

**Acción WF-04:** rechazar cualquier GO sobre el esqueleto actual; exigir diff revisado del entrypoint, revisión independiente y autorización owner. No inferir que la CI del PR #321 certifica la configuración del PR #322.
