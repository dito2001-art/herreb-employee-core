# EMP-002 — Runbook G0 aislado: calendario y estado, sin Meta

Fecha: 30/10/2026. Base #322 `e6257b14ab6674941d44e0bdc3b472f1ca00d74c`; correctivo en PR separado. Este documento prepara acciones futuras: **no autoriza ejecutarlas**. No repetir la suite funcional Miniflare de #321; conservar su [CI histórico](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40986429886).

## 1. Alcance exacto

El entrypoint es `staging/emp002-entry.ts`, nunca el Worker general. Expone únicamente:

- POST `/staging/emp002/calendar` → `/native-calendar`: get/list/availability/reminders y save solo para owner, con versión esperada y tenant derivado del JWT.
- POST `/staging/emp002/reminder-status` → `/internal/native-reminders/status`: lectura tenant-scoped; token interno recreado en servidor.

Todas las demás rutas/métodos se deniegan. No hay webhook, execute, claim, reconcile, cron, queue consumer, RPC de Cloudflare, publicaciones o mensajes Meta en G0. La subclase DO vuelve a denegar métodos/rutas privilegiadas, ata la cabecera tenant al ID real del DO y elimina token/número Meta aun si se inyectan accidentalmente.

La aplicación Access debe ser exclusiva de EMP-002. JWT RS256 validado con issuer, AUD y JWKS de configuración confiable; nunca tomar claves del JWT. Definir propietario del refresh/rotación JWKS; una clave nueva desconocida debe fallar cerrada hasta actualización autorizada. No usar tokens, keys ni identidades RSA del harness local en Cloudflare.

## 2. Evidencia previa, sin acciones remotas

1. Verificar el HEAD del PR correctivo y su CI exact-head. Registrar SHA, tree, versión Node/Miniflare/esbuild/TypeScript, resultados estáticos y de comportamiento. El CI anterior #40987796399 comprobó un merge sintético con tree idéntico a `e6257b1…`; no equivale al nuevo correctivo.
2. WF-01 revisa el código, política Access propuesta, mapeo de actores/roles/tenants, manifiesto definitivo y aislamiento. A/B deben ser tenants distintos. El usuario de lectura no se convierte en owner para facilitar pruebas. Aprobar cómo se provisionarán registros de B a través de su owner autorizado, sin saltar el gateway ni modificar producción.
3. Identificar cuenta, nombre de Worker, namespace DO nuevo y migración SQLite `emp002-staging-v1`. D1/KV/Queue/services **no se requieren en G0**; verificar su ausencia, no crearlos por rutina. No copiar bindings, rutas, números, propietarios ni credenciales de producción.
4. Resolver el transporte de pruebas: el Worker sin routes/workers.dev/previews no tiene una URL HTTP utilizable. Proponer un transporte privado o gateway separado protegido por Access, con origen, service binding y políticas exactos revisados. No inventar una URL, abrir workers.dev ni usar RPC como atajo.
5. El esqueleto `staging/emp002.wrangler.preflight.jsonc` sigue NO DESPLEGABLE: nombre NOT-DEPLOYABLE, identidades/manifests vacíos, sin issuer/AUD/JWKS/token interno. Se necesita un manifiesto definitivo revisado; cambiarlo requiere nueva revisión del SHA/configuración.
6. Exigir permisos del pipeline solo de lectura en CI de pruebas; no introducir secretos Cloudflare, despliegues automáticos, cron ni comandos remotos. Inventariar y revisar vías de publicación efectivas antes de autorizar la primera activación.

## 3. GO dual y autorización para la primera activación G0

Solicitar decisiones **independientes** de WF-01 y WF-04 usando [el paquete final](security-release-review-package.md), para el mismo SHA y manifiesto definitivo. Un GO de código/preflight no certifica recursos que aún no existen. La autorización del propietario debe nombrar las acciones concretas de creación/migración/deploy/transporte que correspondan. Hasta contar con eso, no ejecutar ninguna.

Después de autorización, el operador designado registra los recursos realmente creados, versión/artefacto, SHA/tree, configuración y bindings efectivos. El read-back del control-plane no debe activar RPC, tests, cron o Meta no autorizados. Si difiere del plan, detenerse. La primera versión/URL son evidencia posterior a la activación, no requisitos imposibles que se simulan antes de existir.

Antes de abrir una sesión HTTP: confirmar Access y aislamiento reales, ausencia de bypass por workers.dev/previews/routes/services y ausencia de ejecutores/credenciales Meta. Solo entonces pedir/usar la autorización específica de E2E G0.

## 4. Única sesión real G0, solo tras autorización

- Registrar UTC, entorno, SHA/tree/versión, actor seudonimizado y tenant, ruta/operación, HTTP real, revisión/CAS, correlación y resultado. Nunca guardar cookies, JWT, secretos, teléfonos o mensajes privados.
- A owner: crear tarea/evento → GET independiente y comparación → modificar con expectedVersion → GET nuevo → conflicto de una escritura obsoleta → cancelar → GET CANCELLED y lectura/listado posterior. Comparar datos y revisión, no solo códigos HTTP.
- B: usar registros previamente provisionados por el owner autorizado de B. Probar lectura propia, lectura directa de A y escritura con scope A; hacer el inverso con el owner A. Un null de un ID que nunca existió no prueba aislamiento. Repetir GET de A y B y comparar integridad tras los intentos.
- Reader: confirmar lectura permitida del tenant asignado y save 403; JWT inválido/ausente/expirado, origen ajeno, cabeceras de scope/token inyectadas, contenido no JSON y tamaño excesivo deben denegarse sin mutación.
- Recordatorios: configurar/cancelar mediante calendario y consultar estado cuando exista; no ejecutar ni reconciliar. El gateway G0 **no permite** demostrar PENDING→UNKNOWN→SENT de Meta real. Ese recorrido pertenece a un futuro G1 revisado, no a una variable de activación.
- Observar rutas privilegiadas rechazadas, cero intentos Meta y ausencia de tráfico externo inesperado. No realizar DO directo ni Cloudflare RPC remotos salvo aprobación específica posterior; los tests de DO directo de este paquete son exclusivamente Miniflare local.

## 5. Stop conditions y recuperación

Abortar por scope cruzado, permiso indebido, ruta pública/bypass, binding de producción, intento Meta, duplicación, read-back inconsistente, evidencia incompleta o código/configuración distintos. Cerrar el transporte o deshabilitar el ingreso staging únicamente dentro del alcance autorizado; no tocar producción. Preservar SQLite y recibos, sin borrar ni revertir datos.

**Primer staging:** si no hay versión previa aprobada, no afirmar rollback probado. Mantener ingreso cerrado y preparar forward-fix revisado. No eliminar namespace ni revertir migración para volver a un supuesto estado inicial.

**Staging con versión previa:** WF-04 identifica versión anterior real, compatibilidad del esquema/clase/migraciones y acciones exactas de vuelta de código, con read-back posterior. Cambiar versión no restaura datos. Cualquier rollback efectivo requiere autorización específica y control independiente.

## 6. Fuera de alcance G0

Meta sandbox, ejecución/claim/reconciliación, envíos/cron y publishers requieren otro incremento, GO dual y autorización explícita. El interceptor de salida del harness es **local**; no es un firewall de Cloudflare. No emitir RELEASE funcional completo basándose en este paquete.

**Estado:** paquete preparado; SECURITY/RELEASE GO pendientes. Sin merge, deploy, RPC Cloudflare, cron ni Meta real. EMP-001/003 no se modifican.
