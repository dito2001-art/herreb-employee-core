# Vista previa de EMP-001 V1

La vista estática de revisión se distribuye por separado. No conecta con Sales Ops, no guarda datos ni publica el vendedor. Para ver cambios en Cloudflare se requiere deploy explícito de una versión compilada y verificable.

## Etapa siguiente

1. Montar Emp001Configuration en una ruta autenticada del panel staging B.
2. Implementar API de configuración tenant-scoped con RBAC y read-back.
3. Reemplazar controles locales por GET/PUT autenticados.
4. Probar aislamiento y luego desplegar exclusivamente en staging B.

No se debe confundir un prototipo HTML con el panel publicado.
