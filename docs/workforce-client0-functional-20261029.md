# Plan maestro ejecutable — HerreB AI Workforce Cliente 0 y pilotos

Actualizado: 30/10/2026. Este archivo sustituye el plan anterior de este mismo camino; no crea un segundo runbook. Rama de preparación basada en #320. Estado: preparación revisable, NO-GO operativo. No modifica ramas congeladas, #323, piloto ni recursos. Un portal es funcional solo cuando los tres recorridos reales y su aislamiento están certificados.

## 1. Resultado y fronteras

Entregar un portal único con shell completo #319 para herreb-client-0: ventas, asistente/calendario nativo, workspace marketer y configuración autorizada. Identidad y tenant resueltos en servidor; no selector de tenant arbitrario. Después de aceptación de Cliente 0, incorporar 2–3 tenants piloto con configuración y evidencias propias. Portal actual employee.herreb.com; workforce.herreb.com es destino previsto, no dominio autorizado a activar por este documento.

La preparación integrada avanza en paralelo a EMP-002 G0. #323 permanece congelado y sus solicitudes/GO no se modifican ni heredan. G0 permite calendario y estado de recordatorios sin Meta. Conversación WhatsApp/recordatorios entregados son G1 y requieren su propio código, seguridad, autorización y certificación. Una vista navegable, CI o mocks no acreditan servicio real.

## 2. Inventario fijado y dependencias

Todos los PR Core siguientes permanecían abiertos al auditar. No se ejecutó merge ni rebase de candidatos originales.

| Candidato | SHA completo | Dependencia y reutilización |
|---|---|---|
| [#297](https://github.com/dito2001-art/herreb-employee-core/pull/297) | 9914e570825de52b9798b8493f284c30b6e3c806 | M2M createOnly/expectedRevision; base main 616500dfeaa27c36b73c049a3a0187b92007ce98 |
| [#298](https://github.com/dito2001-art/herreb-employee-core/pull/298) | 42228f67dda1e4db708956b750b3c7018b3202a5 | Consumidor CI M2M usa createOnly; misma base main, rama hermana de #297 |
| [#314](https://github.com/dito2001-art/herreb-employee-core/pull/314) | 2f3f109b20028ad06803ce1a4d1f1bbe4e6500c3 | Workspace conectado sobre #313 98626b213c8a24049929ffb1b9cce5c3e79e2d13 |
| [#315](https://github.com/dito2001-art/herreb-employee-core/pull/315) | 9a26c98c632cf03f6f424001d8ea44a04e7d2f48 | Sobre #314: revisiones copy inmutables, CAS/hash/idempotencia, recibos aprobación y snapshots Brand Brain |
| [#316](https://github.com/dito2001-art/herreb-employee-core/pull/316) | c1a23b4d6e871db20939577321233a032c03930e | Sobre #315: editor y aprobación conectados al portal |
| [#317](https://github.com/dito2001-art/herreb-employee-core/pull/317) | 518b0d5a6a1eb57a303bd513158096cc6547c0e1 | Sobre #316: aprobación de campaña vinculada a revisión/hash mostrados, revalidación transaccional |
| [#318](https://github.com/dito2001-art/herreb-employee-core/pull/318) | 2368a390133c440927aa47977c993269da0f15f0 | Sobre #317: read-back fallido desmonta editor/aprobación |
| [#319](https://github.com/dito2001-art/herreb-employee-core/pull/319) | 324c6c4e143d2f62f70398a0e538e49bb8ab64c2 | Sobre #318: shell completo, Asunción, recordatorios UI y CAS estado Sales Ops |
| [#320](https://github.com/dito2001-art/herreb-employee-core/pull/320) | 4d2cbe1c50d400c30074a61f8b0f101d0ded9c93 | Sobre #319: ingreso integrado autenticado; base de esta preparación |
| [#323 protegido](https://github.com/dito2001-art/herreb-employee-core/pull/323) | fbf459d2fe2ad516b8394aff4770ceff443225d5 | Rama separada #322 e6257b14ab6674941d44e0bdc3b472f1ca00d74c → #321 19e8ab4671084d0f345831eb6a610363fe55da53; referencia de seguridad G0, no fusionar íntegramente |
| [Runtime #27](https://github.com/dito2001-art/herreb-runtime/pull/27) | ac99f3679fcf4fe67682088cd3aac10d3a6dfb16 | Descripción pública: reproducción de carrera de consumidores; no acredita cierre real. Inspeccionar artefacto/archivos efectivos antes de elegir candidato Runtime |

Cadena Core confirmada: #313→314→315→316→317→318→319→320. #297 no es ancestro de #320 (merge-base main 616500df); sin embargo el worker candidato ya exige el contrato CAS y su consumidor CI incluye createOnly. Integrar por equivalencia de contrato/archivos, no cherry-pick ciego ni duplicación de commits. El inventario autoritativo de consumidores M2M sigue siendo gate WF-01.

Evidencia conservada sin repetir: [#319 CI SUCCESS 40958860158](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40958860158), [#320 CI SUCCESS 40968031029](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40968031029), [#318 CI SUCCESS 40956706581](https://github.com/dito2001-art/herreb-employee-core/actions/runs/40956706581), [#323 CI SUCCESS 41092637111](https://github.com/dito2001-art/herreb-employee-core/actions/runs/41092637111). #320 aún dice tests pendientes en su descripción: la API ya devuelve SUCCESS; no usar ese texto antiguo para ordenar otro CI. Reviews #319/#320 vacías al auditar; no inferir GO.

## 3. Auditoría de contratos: reutilizar y completar

| Superficie / archivo | Estado observado | Acción necesaria |
|---|---|---|
| src/workforce-shell.tsx | Monta SalesDashboard, CalendarDashboard y EMP003Workspace completo; asistente y Admin también visibles | Preservar shell. Habilitar cada función según capacidad verificada; controles inaccesibles no deben simular disponibilidad |
| src/staging/workforce-integrated-entry.ts | Autoriza operaciones EMP001 GET, calendario POST, campañas/review/drafts/generate y assets estáticos; deniega upgrades | Faltan /api/emp003/assets y subrutas de contenido/edit/approve/approval/brand-brain. /api/admin/workforce y chat websocket no habilitados: Admin/asistente del shell no son utilizables íntegramente por este ingreso |
| src/worker.ts en #320 | No delega copy assets al BFF existente | Conectar handleEMP003CopyAssets y allowlist granular conjunta; no basta cambiar uno de los dos |
| EMP002 browser calendar | Ya valida origen, JSON, bytes, owner para save, CAS y tenant servidor; 16KiB, esquema distinto de #323 | No reemplazar por payload G0 de /staging/emp002/calendar. Adaptar controles de #323 manteniendo contrato UI /api/emp002/calendar y respuesta/read-back existentes |
| EMP002Operations exportado por #320 | Exporta clase general, no subclase restringida #323 | Elegir clase integrada sin ejecutores G1 o delegación HTTP privada revisada. Conservar validación tenant contra ID del DO, bloqueo de rutas y credenciales Meta del patrón #323; no exportar inadvertidamente scheduled/queue/RPC |
| EMP003 dominio/BFF/R2 | Lifecycle de #315–318 existe; las rutas nuevas faltan en integración | Reusar byte/hash GET independiente, CAS, tenant/campaign/profile pins, aprobación exacta y no heredada. Brand Brain autoritativo; texto manual no crea claims verificados |
| EMP001 browser sales | Solo lectura; SALES_OPS_TENANT_ID y token único deben coincidir con actor | Útil para Cliente 0, pero B legítimo no puede operar ventas por el mismo binding escalar. Resolver directorio servidor de credenciales/servicios por tenant o Workers dedicados; no aceptar token/tenant del navegador |
| EMP001 WhatsApp | #320 conserva ingreso Core anterior; rutas webhook fuera del ingreso browser | Frente separado firmado, tenant por número receptor, proxy firmado y claims atómicos; no abrir webhook desde allowlist browser ni usar websocket como atajo |
| Pago | Sales Ops cambia PAYMENT_CONFIRMED si evidence es no vacío | No hay verificación de cobro en ese control. Implementar/adaptar fuente verificable (proveedor sandbox o conciliación humana respaldada y auditada), referencia única y read-back. Un string arbitrario no certifica pago |

Trabajo local recuperable, NO parte del SHA #320: Core ff984207f8be4f218dee21af45109e51a89b306b agrega delegación copy, firma HMAC bytes originales y partición tenant/empleado; 5884163 documenta bindings. Está en otra línea local, no conserva por sí sola los archivos exclusivos #320. Rescatar cambios selectivos en rama nueva, revisar diff final y publicar SHA; no tratarlo como PR remoto aprobado. Directorio runtime-candidate contiene firma y handlers/fixtures claims; no es checkout Git con procedencia remota suficiente. Obtener árbol, base, hash de archivos y PR revisable antes de incorporarlo. Ninguno autoriza desplegar.

## 4. Sales Ops: SQL, adaptador y servidor candidato

Fuentes auditadas: services/sales-ops/worker.js, migrations/0001_order_create_operations.sql, README.md y src/adapters/sales-ops.ts del SHA #320. README atribuye origen a editor Cloudflare versión 3cddbd33 del 27/10; es procedencia histórica, no read-back actual.

- Adaptador deriva operation_id = quote: + SHA256(JSON.stringify([tenantId, quoteId])); reintento conserva la misma operación. GET /api/v1/orders/:id es independiente. Token y X-Tenant-ID se resuelven servidor; servidor exige credencial asociada a un solo tenant activo.
- Migración crea ledger PRIMARY KEY(tenant_id,operation_id), UNIQUE tenant/quote y tenant/order; backfill legacy:id para orders con quote_id no NULL; trigger rechaza línea qty<=0/producto inactivo/stock insuficiente. No es un script repetible sin ledger migratorio: CREATE TABLE/CREATE TRIGGER sin IF NOT EXISTS; ejecutar una sola vez con versión/registro del migrador.
- CREATE order hace ledger + pedido + aceptación quote + líneas + decremento stock + auditoría en D1 batch; replay consulta ledger antes de revisar OPEN. Mismo operation distinto quote rechaza409; quote con otra operación rechaza409. CAS estado/audit en batch evita dos confirmaciones del mismo estado anterior.
- Preflight SQL exclusivamente después de acceso/autoridad definidos: inspeccionar schema real, IDs duplicados/vacíos/NULL, tenant válido, quotes huérfanas, líneas repetidas y stock; conservar backup compatible. Duplicados tenant/quote hacen fallar backfill intencionalmente; no suprimir error ni deduplicar negocio automáticamente.
- Falta demostrar schema/migración/aplicación efectivos en D1 aislada, atomicidad bajo concurrencia real y recuperación tras respuesta perdida. No hay read-back autoritativo actual que certifique producción. No ejecutar aquí ni siquiera endpoints GET del servidor que puedan crear tablas (tenant-operations contiene CREATE TABLE IF NOT EXISTS).
- Pagos requieren contrato separado autenticado y no aceptan confirmación por conversación/captura sin conciliación. Auditar estado, importe/moneda, referencia, tenant, firma/procedencia e idempotencia; evento duplicado o no verificado no cambia pedido.

## 5. Arquitectura multi-tenant objetivo (decisión a revisar, no configuración activa)

Un portal/browser origin protegido por Access, BFF del mismo origen y servicios privados. JWT firma RS256, issuer/AUD/tiempos y JWKS confiables; actorId/tenantId/role desde mapa/directorio autoritativo. Nada se deriva de email/header/body no verificado. owner administra y escribe dentro de tenant; user lee salvo capacidad explícita revisada; platform_admin separado, nunca habilitado por email/flag del cliente. No abrir Admin hasta contrato RBAC del control-plane aprobado.

| Recurso | Estrategia y control obligatorio |
|---|---|
| DO | Namespace nuevo por entorno/clase; idFromName(tenant:ID) y validación dentro del DO. Estado global solo para control-plane restringido, no datos de tenant expuestos. Claims por tenant/messageId |
| D1 | Sales Ops aislado físicamente de producción. Compartir entre pilotos solo tras índices compuestos tenant/id, consultas/joins scopeados y A/B; separar físicamente cuando credenciales/riesgo lo exijan. Ledger y auditoría siempre tenant-scoped |
| KV | Namespace por entorno y claves tenant:purpose:id; caché sin autoridad para locks, pedidos o pagos |
| R2 | Bucket privado por entorno, claves tenant/campaign/asset/revision, BFF autoriza antes de leer; hashes/bytes validados. Sin URLs públicas ni selector de bucket cliente |
| Configuración | Versionada por tenant: Brand Brain, catálogo/precios, moneda, timezone America/Asuncion, owner y canales. Cambios monotónicos/version/hash; no copiar perfiles o claims entre tenants |
| Secretos/servicios | Resolución server-side por tenant y propósito; sin token universal expuesto. Worker/credencial dedicados si el servicio solo admite tenant escalar. Inventario de bindings y de invocadores, no solo bindings salientes |
| Publicación | Access dedicado, origen/transporte aprobado, workers.dev/previews/rutas/cron/consumidores explícitos. Entrypoint browser sin egress Meta; G1 aislado en servicio con permisos mínimos. JWKS/Workers AI son salidas distintas, inventariarlas |
| Auditoría | tenant/actor/operación/correlación/versión/hash/mutationState y resultado; sin tokens, teléfonos ni cuerpo privado. Retención/acceso y evidencias sanitizadas definidos |
| Recuperación | Cerrar escrituras/ingreso según permiso, preservar DO/D1/R2/recibos; primera versión sin rollback previo: forward-fix revisado. Código anterior solo si compatible con esquema/guards de perfiles; no borrar datos ni revertir migraciones por defecto |

Manifiesto #320 contiene DB 488f4829-bee4-4e0a-8ecd-bd4a1ced71b4 y KV 0c24a032442d47adb30dfc8dbf72b010: referencias candidatas, no pruebas de aislamiento. No declara R2 copy ni SALES_OPS, identidad staging efectiva o transporte. workers_dev:false no prueba previews deshabilitadas (no declaradas). AI remote:true no autoriza gasto. No desplegar ese manifiesto como sustitución de configuración existente.

Evidencia Cloudflare de solo lectura ya recuperada en [solicitud #323](https://github.com/dito2001-art/herreb-employee-core/pull/323#issuecomment-6528497397), sin repetirla ni modificar ese frente: cuenta principal accesible; gateway staging sin bindings/variables, owner-only Access, workers.dev protegido habilitado/previews apagadas; único EMP002Operations en Core compartido. No acredita transporte integrado privado, tenant B ni nuevo namespace. No reutilizar cuenta/políticas EMP003 por conveniencia.

## 6. Secuencia de PR revisables y camino crítico

No son PR ya creados: son incrementos previstos, cada uno con SHA/contrato y diff limitado. Este PR solo actualiza este plan sobre #320. No realizar merge para preparar integración; commits/cherry-picks locales y PR apilados son revisables.

| Orden | Responsable / incremento | Dependencias y salida verificable |
|---|---|---|
| I1 | WF-04 + WF-03: completar ingreso portal | Base #320; rescatar delegación copy local, allowlist método/ruta exacta y assets; shell #319 intacto; decidir Admin/chat por capacidad (HTTP autenticado o canal explícito revisado, nunca abrir upgrades globales). Pruebas nuevas de rutas reales UI→BFF y errores; ejecutar solo gates afectados |
| I2 | WF-02 + WF-01: frontera calendario integrada | Sobre I1, adaptar patrón #323 sin tocar su rama ni bloquear G0: DO tenant pin, clase limitada, sin Meta; conservar API portal/CAS/timezone/read-back. Validación integrada nueva, no repetir suite #323 |
| I3 | WF-02: Sales Ops + Runtime | Rama Core/servidor y PR Runtime complementario, SHA fijados; directorio tenant credenciales, claims/cola atómicos y firma ingreso. SQL permanece candidato. Revisión de consumidor create_order y recuperación UNKNOWN antes de autorizar DDL |
| I4 | WF-02 + propietario cobros: pago verificado | Fuente autoritativa, referencias/importe/moneda, autenticación, idempotencia y read-back; portal presenta verificado solo con recibo real. Sandbox hasta permiso explícito |
| I5 | WF-01 + WF-04: release integrado | Inventario/manifiestos definitivos sin IDs ambiguos, circuito publicación/egress, consumidores M2M y onboarding A/B; GO dual exacto + autorización owner antes de activar |
| I6 | WF-04 + Dito: aceptación real y pilotos | Read-back versión/bindings, HTTP A/B/integridad y recorridos; primero Cliente 0. Repetir onboarding/certificación para 2–3 pilotos, no ampliar mapa de tenants como prueba de seguridad |

I3 puede prepararse mientras I1/I2 avanzan; la activación espera la combinación revisada. Camino crítico: ingreso completo + aislamiento integrado + Sales Ops/Runtime/pago → configuración aislada exacta → GO dual/autorización → read-back → E2E Cliente 0 → 2–3 pilotos. No esperar G1 de recordatorios para preparar calendario/marketing; no declarar completo el asistente con recordatorios externos hasta certificar G1.

## 7. E2E ejecutable: evidencia de funcionamiento, no mocks

Cada sesión requiere permiso concreto; registrar UTC, URL, SHA/tree/versión, manifest digest, actor seudonimizado, tenant, operación, correlación, HTTP y resultado persistido. No inventar códigos ocultos por Access. Crear fixtures sintéticos autorizados; separar A owner Cliente0, B tenant distinto y reader de A/B. Integridad antes/después por GET y hashes/versiones de ambos tenants. Ningún canal real se prueba sin autorización.

| Recorrido | Pasos y criterio de aceptación |
|---|---|
| Portal | Login Access → identidad/tenant/capacidades servidor → navegar tres módulos; reload recupera datos. Sesión expirada/tenant cambiado borra estado anterior y controles. APIs desconocidas no devuelven SPA; static assets autenticados; admin/upgrade denegados si no habilitados |
| EMP001 conversación/venta | Mensaje firmado del número autorizado → recomendación con catálogo/precio vigente → cotización persistida → confirmación → pedido único con operation_id estable → GET independiente. Dos webhooks, dos consumidores y dos create_order concurrentes: un pedido/ledger/auditoría/descuento stock; respuesta perdida reconcilia misma operación, no duplica |
| EMP001 pago | Comprobante/evento verificable de fuente autorizada → validación tenant/order/importe/moneda/ref → transición única → GET y recibo independiente. Duplicado no vuelve a confirmar; evidencia arbitraria, tenant ajeno o evento sin autenticar no modifica pedido. Cobro real separado del test sandbox y sujeto a autorización |
| EMP002 G0 | Crear tarea y evento → POST get independiente → editar con expectedVersion → get actualizado → stale CAS409 y conflicto horario409 sin cambios → cancelar → get CANCELLED/list actualizado. Mostrar America/Asuncion inequívoco. Configurar/quitar reminderAt y leer estado; no mostrar entregado sin proveedor |
| EMP002 G1 | Solo con incremento/GO/permiso propios: WhatsApp crear/consultar/editar/cancelar, owner autorizado y duplicados; reminder persistido → fence UNKNOWN antes de envío → SENT con ID proveedor/read-back. Timeout ambiguo jamás reenvía automáticamente; reconcile con evidencia. Cron no es requisito a activar por defecto |
| EMP003 | Campaña tenant propia → generar copy con perfil aprobado → GET bytes/hash → editar revisión inmutable → replay mismo intent sin llamada AI duplicada → GET → aprobación exacta asset/revision/hash/campaign/profile → GET aprobación → nueva versión sin herencia → calendario proyecta fechas persistidas, no publica. APPROVED protegido; read-back fallido no muestra editor ni éxito |
| A/B por módulo | Sembrar registros existentes A y B; lectura/listado/status/URL directa ajenos denegados o null según contrato; escrituras con scope ajeno rechazadas. Repetir GET de A/B y comparar contenido/version/stock/recibos. Reader no escribe. Verificar objeto/ledger por scope mediante vías HTTP autorizadas, sin RPC |
| Ciclo comercial | Vincular campaña/revisión → lead con consentimiento/procedencia → conversación/cotización/pedido → seguimiento calendario → medición con IDs reales. Definir handoff persistido e idempotente donde falte; no afirmar automatización porque tres pantallas se abren |

Pruebas de cambios futuros deben cubrir invariantes antes de remoto; PASS preexistente se conserva, no se redispara sin delta. Nuevas pruebas locales son preparación, nunca sustituyen esta matriz. Fallo de aislamiento, permiso, duplicación, pago falso, salida no autorizada, mezcla de versiones o read-back inconsistente: STOP, NO-GO, cierre autorizado de ingreso/escrituras, preservar datos y corregir en PR.

## 8. GO/NO-GO por dimensión y empleado

| Dimensión | Estado actual | Evidencia para cerrar / responsable |
|---|---|---|
| Código base | PASS acotado #319/#320 y cadena EMP003; brechas de ingreso/pago/multitenancy Sales no cerradas | I1–I4, diffs revisables y validaciones afectadas; WF02/03/04 |
| Integración | NO-GO | UI→rutas completas, tenant credentials, DO restringido, Runtime candidato identificable, handoff; WF04 |
| Staging | NO-GO | Cuenta/destino, namespace DO/D1/R2/KV aislados, Access A/B, manifiestos y transporte protegidos efectivos; WF01 |
| Seguridad/release | NO-GO, sin dictámenes independientes #319/#320 | Dos decisiones distintas sobre combinación exacta SHA/configuración/alcance; WF01 y WF04 |
| Autorización | PENDIENTE | Dito autoriza recursos/migración/deploy/transporte concretos tras GO dual; canales/pagos/publicación y E2E por alcance separado |
| E2E | NO CERTIFICADO | Recorridos reales anteriores y read-back/integridad posterior; WF04 + Dito |
| Pilotos | BLOQUEADO | Cliente 0 aceptado primero; onboarding/configuración/canales/aislamiento de cada nuevo tenant |

| Empleado | Código aprovechable | Falta efectiva para uso completo |
|---|---|---|
| EMP001 | Dashboard read-only, catálogo/cotización/adaptador, SQL ledger y CAS candidatos | Tenant routing servicios, artefacto Runtime/claims activo, pedido concurrente real, cobro verificado y conversación real autorizada |
| EMP002 | Agenda portal nativa, timezone, CAS/read-back; patrón G0 protegido #323 | Frontera segura integrada, chat usable por transporte permitido, A/B HTTP real; G1 reminder WhatsApp independiente |
| EMP003 | Workspace, editor/revisiones/aprobaciones/Brand Brain y calendario | Rutas copy del portal, binding R2/perfil/campaña, versión real, A/B y aceptación sobre candidato nuevo |

## 9. Única próxima acción

Preparar I1 en rama nueva apilada sobre #320: conectar BFF copy existente y su allowlist granular, preservar shell #319, definir capacidades Admin/asistente que el ingreso realmente soporte y agregar pruebas de integración afectadas. No cambiar #319/#320/#323 ni piloto. Antes de activar algo, entregar a WF01/WF04 manifiesto/configuración exactos y solicitar dictámenes independientes. Esta preparación no da GO ni autoriza merge/deploy.
