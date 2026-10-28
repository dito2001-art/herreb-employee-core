# Copy integrado posterior a #304

Implementación en la rama de #305; no desplegada. #304 permanece en `0dd809758530f7b634c44062f0699e48b68602ed` y el piloto en versión `be751f6f-25be-46ab-ab3f-d36a9894f424`.

## Camino implementado

Portal → Access BFF → DO del tenant → campaña persistida/revisión exacta → contexto de marca autorizado → reserva transaccional de cuota/operación → Workers AI → validación grounded → R2 privado/read-back → registro CAS → listado → GET de bytes/hash/revisión → comprobación SHA-256 en navegador. No hay publicación, imágenes ni video en este incremento.

El servidor lee `EMP003_COPY_CONTEXTS_JSON`, validado por `CopyContextSchema`: tenant/revisión/cuota/marca/audiencias/ofertas/knowledge/claims y vínculos explícitos por campaña, revisión y canal. El vínculo exige campaña existente, tenant coincidente, audiencia y canal presentes, oferta activa, objetivo/fechas coincidentes y claims con knowledge canónico verificado y referencias de procedencia. No transforma un mensaje de campaña en un claim verificado ni inventa marca, hechos o metas. Cambiar la campaña invalida el vínculo de generación hasta revisar su configuración.

El BFF acepta solo IDs de campaña/asset/operación, revisión esperada del asset, revisión de campaña y canal. Tenant y actor provienen de JWT verificado con el issuer/AUD/identity map dedicado del piloto. Owner genera; user solo lee. Campos de tenant, marca, claims u objetos de contexto enviados por cliente se rechazan. No existe endpoint público para escribir o marcar verificado el contexto.

| Ruta nueva | Operación |
|---|---|
| GET `/api/emp003/assets/context?campaignId=...` | Revisión/canales habilitados y estado de edición |
| POST `/api/emp003/assets/generate` | Generación y registro; respuesta terminal o pendiente |
| GET `/api/emp003/assets?campaignId=...` | Heads de biblioteca del tenant/campaña |
| GET `/api/emp003/assets/content?campaignId=...&assetId=...&revision=...` | Bytes exactos text/plain, no-store, nosniff, hash y revisión |
| GET `/api/emp003/assets/status?campaignId=...&operationId=...` | Consultar una operación sin volver a generar |

## Cuota, idempotencia y recuperación

La cuota reserva una invocación por tenant/día UTC dentro de una transacción DO, antes de contactar al modelo; límite configurado 1–20, sin default permisivo. Errores consumen la reserva; no hay reembolso automático. La operación conserva fingerprint del comando, actor, hash/revisión de contexto y timestamp. Una misma operación con otro comando se rechaza. Un lock de asset impide generaciones concurrentes para la misma revisión; CAS se comprueba antes de invocar y al registrar.

- STARTED: otra solicitud devuelve pendiente, jamás invoca otra vez. Si el proceso se perdió, el estado es ambiguo y exige conciliación/intervención; no expira para autorizar reenvíos ciegos.
- GENERATED: el texto ya está conservado en DO. Reenviar exactamente la misma operación puede completar el registro sin otra llamada a IA.
- SUCCEEDED: se reutiliza el recibo. El portal consulta bytes por separado y verifica hash antes de mostrar lectura exitosa.
- FAILED: fallo terminal de proveedor/validación; sin asset. Reutilizar la operación no llama al proveedor. Un nuevo intento explícito consume otra cuota.

La transacción que registra metadata comprueba nuevamente review state y revisión de campaña: aprobación/revisión o edición concurrente impiden registrar un asset contra una campaña que cambió. Los bytes R2 huérfanos por fallo de CAS no se publican ni borran automáticamente. La reserva y el registro no constituyen autorización editorial ni de publicación.

El portal conserva en sessionStorage el comando pendiente por tenant/campaña antes de enviarlo. Tras error de red permite consultar estado; no reenvía una generación automáticamente. Permite seleccionar campaña, listar assets, abrir contenido, recuperar versiones anteriores y generar nueva versión. Un read-back inválido nunca muestra confirmación de hash verificado. El listado/lectura existentes no dependen de conservar habilitada la configuración de generación.

## Configuración preparada, sin activación

`deploy/staging/emp003-copy.resources.plan.json` es un plan, no un manifiesto Wrangler ejecutable. Propone bucket **privado** `herreb-emp003-pilot-copy-assets` y binding `EMP003_ASSET_BUCKET` solo en cuenta `43147827695cce6931d9dc625ec240a7`, Worker `herreb-emp003-staging`. No se modificó el manifiesto efectivo, no se creó bucket/binding y no hay nueva clase/migración DO. La disponibilidad/activación R2 y términos/costos deben confirmarse por el propietario antes de crear recursos.

Para habilitar hacen falta: cerrar #304 A/B real; aprobar perfil de marca/knowledge/claims y vínculo a una campaña DRAFT/revisión exacta; fijar cuota; autorizar específicamente recurso/binding/configuración y despliegue del SHA revisado. No se solicita un secreto de plataforma de publicación.

Recuperación: deshabilitar solo ingreso piloto si se autoriza, conservar DO y bucket privado, mantener recibos/cuota, investigar STARTED ambiguos y preparar forward-fix. No borrar clases, namespaces, datos o políticas; no afirmar rollback inicial probado.

## Evidencia nueva de #304 — 28/10/2026, GMT-3

A autenticado como tenant `herreb-client-0`; GET independiente inicial de operations devolvió lista vacía. Se hizo una única nueva generación después de esa comprobación. Respondió con propuesta real alrededor de dos minutos; no se repitió la llamada. Fue editada y guardada desde la interfaz.

Campaña: `campaign-820ff31e-a477-42c4-a8bf-c6f8d12da30a`. Correlation: `2c321070-b88d-4723-9714-850fc2835464`.

[GET independiente protegido](https://herreb-emp003-staging.herreb-emp003-pilot.workers.dev/api/emp003/drafts?campaignId=campaign-820ff31e-a477-42c4-a8bf-c6f8d12da30a) confirmó revisión 1, nombre/fechas/datos generados y edits; recarga del portal recuperó esos datos. Dos pestañas abiertas en revisión 1: una guardó revisión 2; la otra recibió conflicto y quedó bloqueada. GET posterior conservó edición A y revisión 2.

Se transitó DRAFT → IN_REVIEW → APPROVED con motivos explícitos de certificación, sin permiso de publicación/gasto. Campos y Guardar quedaron deshabilitados. Una pestaña vieja intentó escribir contra revisión 2 tras aprobación: rechazado; GET posterior conservó datos/revisión 2. **Limitación verificada:** ese rechazo llega como HTTP 503 y mensaje genérico, no como error semántico de inmutabilidad. Logs del Worker: requestId `0d94c1ccf6d27c821f069914daf0d0e2`, 17:18:04 GMT-3, 191 ms, versión be751f6f. No se cambia #304 para corregirlo.

[Observability del Worker](https://dash.cloudflare.com/43147827695cce6931d9dc625ec240a7/workers/services/view/herreb-emp003-staging/production/observability). No se conservan IPs, cookies, JWT ni coordenadas de los logs. B y aislamiento real siguen pendientes del ingreso de `dito37@hotmail.com`; no se certifican con JWTs de prueba.

Pruebas locales afectadas del incremento: 9 PASS, incluyendo React→BFF con JWT de prueba→DO sobre SQLite→object store inyectado→GET de bytes y recarga/versiones; cuota/concurrencia/replay/errores/corrupción, permisos/origen/cross-tenant y protección ante review/revisión concurrentes. TypeScript, lint específico, formato y build frontend PASS. Los fixtures de proveedor/R2 no son prueba real de Workers AI/R2. La prueba Node antigua del entrypoint completo no corre directamente por `cloudflare:`; la nueva prueba de ingreso aísla el Worker compartido y verifica que las rutas nuevas no caigan en él. No se presenta como prueba workerd ni CI integral.
