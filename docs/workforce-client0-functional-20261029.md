# Workforce Cliente 0: cierre funcional de EMP-001, EMP-002 y EMP-003

Fecha: 29/10/2026. Candidato apilado sobre #318. Sin merge/deploy ni cambios de recursos, secretos o datos remotos.

## Hallazgos y cambios de este incremento

| Área | Defecto o brecha comprobada | Resultado del código candidato |
|---|---|---|
| EMP-001 Sales Ops | Dos transiciones concurrentes del mismo pedido devolvían 200 y podían duplicar auditoría. Reproducción local: [200,200]. | CAS por estado anterior y auditoría en el mismo batch. Solo un cambio aplica, el perdedor devuelve 409; fallo de auditoría revierte el cambio. No cambia el JSON del cliente ni agrega una migración. |
| EMP-002 portal | El estado y servidor soportaban reminderAt, pero faltaba un campo para crearlo o quitarlo. | Campo opcional de recordatorio y acción para quitarlo, con guardado CAS, GET independiente y recarga. Recordatorios visuales mientras el portal está abierto; no se agregan envíos automáticos. |
| EMP-002 horarios | El formulario dependía de la zona del dispositivo. El circuito WhatsApp guardaba 09:00Z al pedir 09:00 de Asunción cuando el servidor corría en UTC. | Conversión explícita America/Asuncion en formulario, ventanas, visualización y creación/edición nativa por WhatsApp. Fechas inválidas se rechazan. |
| EMP-002 acceso | Una recarga fallida podía conservar controles de escritura de una lectura anterior. | Revoca controles y listado al recargar; una lectura fallida no mantiene permisos anteriores. |
| EMP-003 integración | El shell general montaba solo CampaignDashboard, dejando fuera Creative Studio y Brand Brain. | El botón EMP-003 abre el workspace existente completo, reutilizando los contratos de #315–#318. |

No se reconstruye Sales Ops: `services/sales-ops/README.md` ya documenta el código candidato recuperado del Worker y la migración idempotente previa. El adaptador actual ya deriva operation_id estable por tenant/cotización. Los comentarios históricos que indicaban ausencia de servidor o operation_id no describen este árbol candidato; tampoco prueban que esté desplegado.

## Evidencia remota de solo lectura, 29/10

- Chrome expuso el piloto `https://herreb-emp003-staging.herreb-emp003-pilot.workers.dev/` después del inicio de sesión realizado por el propietario. GET visible `/api/emp003/operations` devolvió `ok:true`, `tenantId:herreb-client-0`, `permissions.canWrite:true`. Se observaron dos campañas, una aprobada y otra borrador.
- Selección y apertura de `copy-46e76223-3246-4137-ac44-3a8de7772888`, revisión 1: el portal recuperó texto y mostró SHA256 `58900c03e6b3cc004f7560381b8bb542c8ad57cd93f4b377fd4b3e66de6b4bec`, igual a la evidencia previa de #313. No hubo generación, edición ni aprobación. Esto es lectura de A sobre el piloto existente, no prueba de #318 ni de este candidato; no se atribuye código HTTP que el navegador no haya expuesto.
- `https://employee.herreb.com/` mostró navegación antigua EMP-002/EMP-003/Admin, consola EMP-002 Disconnected y envío deshabilitado, con conversación histórica. No se envió ningún mensaje. El shell completo de este candidato no está demostrado en ese despliegue.
- No se observó una sesión B ni una pestaña Cloudflare en las pestañas expuestas. No se afirma aislamiento A/B ni versión/bindings efectivos de Sales Ops o EMP-002.

## Aceptación local y límites

Pruebas sobre handlers reales de Sales Ops con SQLite/adaptador D1, BFF con JWT de fixture y EMP002Operations recreado sobre SQLite; Meta y AI son dobles locales, sin llamadas externas. La integración de UI verifica navegación entre ventas, agenda y workspace, formulario de recordatorios, recarga y cierre de controles tras fallo. El circuito WhatsApp nativo verifica crear/editar/cancelar, consulta posterior, duplicados y rechazo del emisor no autorizado. La suite se ejecuta también con TZ=UTC para reproducir las condiciones del servidor.

Estas pruebas no certifican D1/DO/Meta/Workers AI reales ni que los tres empleados generen ingresos en conjunto. El handoff comercial marketing → lead → venta → seguimiento → medición sigue pendiente de aceptación real; navegar entre módulos no sustituye ese ciclo.

## Puertas de activación para los tres empleados

1. WF-01 y WF-04 revisan independientemente el SHA final y los entornos concretos. Preservar #313–#318, sin merge/deploy automático. El CI nuevo solo valida código y build; no tiene credenciales ni pasos de despliegue.
2. EMP-003: validar perfil autoritativo y vínculo de campaña/revisión/canal; autorizar candidato exacto, preservando R2, contexto, Access y demás bindings existentes. El manifiesto estático no debe reemplazar a ciegas la configuración efectiva. Ejecutar edición/versiones/aprobaciones exactas y A/B con integridad posterior de A según `docs/emp003/copy-lifecycle-contract.md`.
3. EMP-002: confirmar Worker/DO y tenant/owner Meta efectivos, calendario nativo y ausencia de fallback CRM/Google. Desplegar solo en aislamiento autorizado. Ejecutar una cita real crear → GET → modificar → GET → cancelar → GET, recordatorio persistido y prueba de respuesta ambigua sin reenvío automático. Recordatorios externos aún requieren un mecanismo revisado de ejecución y autorización; no presentarlos como entregados por esta UI.
4. EMP-001: verificar fuente/versión/binding D1 reales contra `services/sales-ops/README.md`, schema y migración candidata. Revisar copia/backup y duplicados antes de autorizar DDL en una base aislada. Validar credenciales por tenant y routing Core/runtime. Probar pedido con 2 webhooks/2 consumidores/2 create_order, GET independiente, inventario/auditoría únicos y transición CAS. Las pruebas del Worker por sí solas no certifican el runtime de cola ni Meta.
5. Tras GO dual y autorización específica, desplegar por entorno y registrar versión/SHA/bindings; conservar datos y plan de recuperación compatible. No inferir autorización de cambios de secretos, aplicaciones Access, publicación externa o gasto.
6. Aceptación de Cliente 0: Dito completa los recorridos en las URLs entregadas, con resultados persistidos, errores recuperables y aislamiento probado. Después demostrar el ciclo comercial completo y medir resultados; solo entonces avanzar a 2–3 pilotos externos.

Estado: código candidato revisable para los tres frentes; SECURITY/RELEASE NO-GO hasta cerrar los gates. No se declaran GO independientes ni Workforce funcional completo.
