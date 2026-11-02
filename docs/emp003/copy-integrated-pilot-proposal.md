# Candidato integrado de copy — propuesta única pendiente de autorización

28/10/2026. No desplegado. SHA exacto y resultado CI se fijan en la descripción del PR de esta propuesta. Este candidato incorpora la cadena #305/#307/#308/#309/#310 y reutiliza los correctivos de #306; no modifica sus ramas ni hace merge. El candidato anterior #306 por sí solo no incluye las nuevas protecciones #308. #304 permanece intacto.

## Evidencia vigente y validación nueva

- #304: A completó generación real, edición, persistencia/reload/GET, conflicto y protección APPROVED. B real: tenant `herreb-emp003-test-b`, lista vacía, canWrite=false y botón de creación deshabilitado; el ID de campaña A devuelve EMP003_DRAFT_NOT_FOUND y tenantId extra se rechaza. POST directo B y acceso A→datos B no están certificados: no hubo POST ni datos B existentes.
- #310 `b465f8353f79cffa99e2c68217e4c550b8b3d8c4`: TypeScript PASS y 9 casos de servicio PASS en este entorno, incluida concurrencia determinista. No se reprodujo un deadlock integrado; no se aplica una corrección especulativa de barrera.
- Integración: mantiene recibo/lock en recuperación y evita reenvíos de IA; añade 409 semántico para campañas revisadas, revalidación de hash de contexto en GENERATED y revisión/revisión de campaña atómicas al reservar cuota. Las fixtures recuperables incluyen ahora el hash original real del contexto.
- 15 casos afectados locales PASS, TypeScript/lint PASS; proveedores/R2 inyectados, SQLite y shim Node de clase base DO. No equivale a Cloudflare E2E. El workflow aislado del PR verifica head SHA exacto, tests/tipos/lint/build con contents:read, sin secretos/credenciales ni publicación. Resultado real se registra en el PR, nunca se infiere del YAML.

## Estado efectivo de Cloudflare

Cuenta piloto `43147827695cce6931d9dc625ec240a7`; Worker existente `herreb-emp003-staging`. El propietario ya activó R2; lectura de overview mostró cero buckets y cero bytes. No existe binding EMP003_ASSET_BUCKET ni variable EMP003_COPY_CONTEXTS_JSON en Settings. El token Individual Workers Editor previo figura Expired; no se reutiliza Workers Admin ni GitHub HerreB Deploy.

Links: [R2](https://dash.cloudflare.com/43147827695cce6931d9dc625ec240a7/r2/overview), [Settings](https://dash.cloudflare.com/43147827695cce6931d9dc625ec240a7/workers/services/view/herreb-emp003-staging/production/settings), [tokens](https://dash.cloudflare.com/43147827695cce6931d9dc625ec240a7/api-tokens).

## Paquete concreto a autorizar

1. Crear exclusivamente bucket Standard privado `herreb-emp003-pilot-copy-assets` en la cuenta piloto. Sin r2.dev público, dominios públicos, CORS público, S3 keys, eventos o borrado automático. Añadir binding `EMP003_ASSET_BUCKET` solo al Worker piloto.
2. Crear credencial efímera Individual Workers Editor limitada a ese Worker/cuenta, máximo dos horas, sin permisos productivos ni provisión de recursos generales. Guardarla por canal seguro, no en chat ni en GitHub. No usar la credencial amplia Workers Admin existente. Si el alcance no puede verificarse, no publicar.
3. Usar perfil propuesto `deploy/staging/emp003-copy.context.proposed.json`: marca HerreB AI Workforce, audiencia Equipo interno de HerreB, canal Piloto interno, solo dos claims comprobados: permite crear/editar/guardar/recuperar campañas; publicación externa deshabilitada. Evidencia: #304 y GET real A. Nada afirma generación de imágenes, ejecución de campañas o resultados comerciales. El archivo no está activo y requiere aprobación factual del propietario.
4. Crear desde A un único borrador nuevo para prueba privada de copy; conservar APPROVED existente. Objetivo exacto del perfil: preparar y recuperar un copy interno sin publicación/inversión; meta 1 copy verificable, fechas 28/10–30/11/2026. Leer su ID/revisión autoritativos y sustituir PENDING_ACTUAL_DRAFT_ID; no generar contra el placeholder. Cuota A 10 invocaciones por día UTC; B conserva user/read-only y no recibe autorización de generación.
5. Tras aprobar fuente/CI/perfil/recursos/credencial y el SHA exacto del PR: cargar solamente ese candidato al Worker piloto, conservando Access/issuer/AUD/A-B, ASSETS/AI/BROWSER, D1/KV, cuatro namespaces DO, v4 y previews deshabilitados. Sin nuevas rutas/dominios, migraciones, secretos, producción o merge. Añadir solo binding/contexto autorizados. Cancelar si la comparación previa detecta recursos distintos o autoaprovisionamiento.
6. Releer versión/SHA/bindings/privacidad antes de E2E. A genera copy real, lista, GET de bytes/hash/revisión independiente, recarga y versiones; consulta operación ambigua sin reenviar IA. B no recupera asset A; verificar el 409 semántico sobre la campaña APPROVED. Ninguna publicación externa, publicidad ni inversión.

## Costos y límites

[Precios R2](https://developers.cloudflare.com/r2/pricing/): Standard incluye 10 GB-month/1 M operaciones A/10 M B mensuales; exceso $0.015/GB-month, $4.50/M A y $0.36/M B, redondeados a unidades facturables. 300 copies de ~50 KB son ~15 MB y pocas operaciones: incremento esperado $0 dentro de franquicia disponible, no garantía de factura cero.

[Modelo](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/): escenario 300 llamadas con 10K tokens entrada/2048 salida ≈ $0.43 bruto equivalente/mes antes de franquicia. [Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) incluye 10K neuronas/día; Free falla al agotar franquicia y no autoriza sobreconsumo de pago. No hay upgrade autorizado. Prompt se limita por caracteres, no tokens; uso real/razonamiento y otras cargas de cuenta varían. Cuota por llamadas no es un techo monetario ni se aplica a la ruta histórica de generación de campañas #304.

## Recuperación y riesgos

Si falla aislamiento, hash, bindings o autorización: detener la certificación; deshabilitar solo ingreso piloto si está autorizado y conservar R2 privado, D1/KV/DO, recibos y cuota. Recuperación mediante forward-fix revisado o versión/config compatibles; no borrar bucket/namespaces ni revertir migraciones. STARTED ambiguo queda para conciliación, jamás reenvío automático. No se afirma rollback probado del flujo nuevo.

Riesgos residuales: R2/IA reales del nuevo flujo sin certificar hasta despliegue, latencia/capacidad Free, errores de read-back, objetos huérfanos por CAS, profile pendiente de aprobación, credencial expirada, POST directo B aún no probado. Mantener NO-GO hasta autorización específica del paquete y SHA exacto. CI PASS no constituye por sí mismo autorización de publicación.
