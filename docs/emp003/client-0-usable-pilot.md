# Cliente 0: activar lo construido para uso de Dito

Fecha: 2026-10-29. Estado: candidato preparado; piloto existente sin cambios.

## Primera entrega utilizable

En el piloto privado EMP-003, Dito debe poder abrir una campaña persistida, generar copy, editarlo como una nueva revisión, recuperar exactamente sus bytes tras recargar, aprobar el contenido mostrado y consultar Brand Brain. Una nueva revisión no hereda aprobaciones. El calendario muestra fechas guardadas. No se habilitan publicación, gasto, recordatorios ni edición de claims desde el navegador.

Dependencias congeladas: #313 `98626b213c8a24049929ffb1b9cce5c3e79e2d13` (piloto con generación y lectura real A documentadas); #314 `2f3f109b20028ad06803ce1a4d1f1bbe4e6500c3` (workspace); #315 `9a26c98c632cf03f6f424001d8ea44a04e7d2f48` (ciclo de copy); #316 `c1a23b4d6e871db20939577321233a032c03930e` (editor); #317 `518b0d5a6a1eb57a303bd513158096cc6547c0e1` (aprobación de campaña exacta). El correctivo de lectura de esta rama se apila sobre #317, sin modificar esas ramas.

## Correctivo de uso

`EMP003CopyLibrary.open` vaciaba el texto al iniciar una lectura pero conservaba el asset seleccionado. Si fallaba la lectura independiente, quedaba montado el editor/aprobación asociado a la selección anterior con texto vacío. Ahora se invalida la selección antes de leer y solo se reinstala después de validar hash, revisión y UTF-8. Ante error, no se muestra editor ni aprobación; el usuario puede volver a abrir el asset desde la lista. El GET de contenido y la integridad del servidor no cambian.

La regresión abre primero la versión actual, corrompe sus bytes en el fixture y vuelve a abrirla; exige error visible y ausencia del contenido/editor. Se conserva la cobertura de recarga, historial, permisos y recuperación de respuesta perdida. Son pruebas locales, no certificación Cloudflare.

## Puertas concretas de activación

1. WF-01 debe revisar independientemente el HEAD final, ingress Access dedicado, identidad A/B, bindings aislados, perfil/configuración efectivos y compatibilidad de recuperación. WF-04 debe emitir su dictamen independiente para el mismo SHA y entorno. Al iniciar esta revisión, #315/#316/#317 no tenían comentarios ni reviews en GitHub; sus CI PASS no equivalen a esos GO.
2. Confirmar por lectura que el perfil autoritativo vincula la campaña elegida, revisión exacta, canal, oferta y claims. Una edición de campaña puede invalidar ese vínculo: no inventar configuración ni tratar datos del brief como hechos verificados. Cualquier cambio de configuración requiere su propia autorización.
3. Con GO dual y autorización específica del propietario, desplegar únicamente el SHA revisado al piloto privado; no actualizar producción. Verificar versión y bindings posteriores. Evitar escritores antiguos concurrentes tras fijar perfiles monotónicos; decidir recuperación compatible o disable-write/forward-fix según `copy-lifecycle-contract.md`.
4. Ejecutar una sesión real según `copy-lifecycle-contract.md`: A genera/edita/recarga/GET/aprueba; nueva revisión sin aprobación heredada; conflicto CAS; rechazo de campaña aprobada; B solo en su tenant, sin lectura ni escritura de A; retorno a A con hashes intactos. Registrar HTTP y versión reales sin cookies/JWT. Una página Access no certifica un rechazo del backend.
5. Entregar a Dito la URL privada y el recorrido probado, indicando las acciones efectivamente disponibles. Hasta entonces, estas nuevas funciones siguen como código candidato.

## Orden posterior del Workforce

- EMP-002: cerrar WhatsApp/portal → calendario nativo → confirmación → consulta posterior con una tarea real y aislamiento; no sustituir el calendario por Google.
- EMP-001: localizar y verificar contrato servidor/D1 Sales Ops, operación estable por tenant, UNIQUE/CAS y GET independiente antes de cambiar el adaptador; después probar venta/pedido sin duplicados ante concurrencia y respuesta ambigua.
- Cliente 0 completo: demostrar demanda → oportunidad → venta → operación → medición antes de pasar a 2–3 pilotos externos. Medir tareas y resultados completados; no asignar un porcentaje global sin criterios aceptados.

No merge, deploy, migraciones, cambios de secretos/Access/configuración, publicaciones ni GO independiente se realizan o atribuyen en este incremento.
