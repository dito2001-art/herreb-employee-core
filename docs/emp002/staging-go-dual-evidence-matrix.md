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
