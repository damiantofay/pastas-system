# Preparación para testeo y publicación en dominio oficial

## Objetivo

Consolidar la versión recuperada de producción, convertir sus flujos críticos en una versión repetible y verificable, publicarla en GitHub y desplegarla en `www.elsastredelapasta.com` sin borrar ni reemplazar la base operativa.

El dominio oficial continúa siendo un entorno de prueba. Aun así, cada despliegue debe preservar código, datos y una ruta de rollback.

## Estado de partida

- Producción ejecuta `4b8b071` más cambios sin commit en `public/js/vender.js` y `public/styles.css`.
- La rama recuperada contiene 29 commits que no están en `origin/master`.
- La base es SQLite en modo WAL y posee backup diario consistente.
- No existe suite de pruebas, CI ni comando `npm test`.
- El backend ofrece autenticación, catálogo público, productos, pedidos, ventas, caja, stock, gastos y reportes.
- El frontend no tiene build: se sirve directamente desde `public/`.

## Alcance

### Incluido

1. Preservar los dos cambios UX recuperados como un commit identificable.
2. Crear pruebas HTTP con `node:test`, procesos reales y una SQLite descartable.
3. Cubrir:
   - portada y catálogo público;
   - bloqueo de APIs privadas sin sesión;
   - login y sesión de administrador;
   - ausencia de `session_secret` en configuración;
   - alta y recepción de un producto de reventa;
   - venta, descuento de stock, caja y anulación con reposición;
   - alta, consulta y cambio de estado de un pedido.
4. Agregar encabezados HTTP de endurecimiento compatibles con el frontend actual.
5. Aplicar únicamente actualizaciones de dependencias sin `--force` y exigir `npm audit` sin vulnerabilidades conocidas.
6. Agregar comandos de prueba y documentación de despliegue/rollback.
7. Publicar una rama consolidada en GitHub.
8. Hacer backup fresco, desplegar en el dominio oficial, probar y revertir si falla.

### Excluido

- Cambiar reglas comerciales o diseño funcional.
- Borrar, resetear, sanear o copiar datos de producción a GitHub.
- Crear un subdominio de staging.
- Migrar a otra base, framework o proveedor.
- Reescribir la historia recuperada.

## Arquitectura de pruebas

La suite usará el runner nativo `node:test`; no se agrega un framework de testing. Un helper:

1. crea un directorio temporal;
2. asigna `DB_PATH` a una SQLite descartable;
3. ejecuta el seed y crea un administrador de prueba mediante la CLI real;
4. reserva un puerto local;
5. inicia `server.js` como proceso hijo;
6. espera una respuesta HTTP;
7. expone un cliente basado en `fetch` que conserva la cookie;
8. termina el proceso y elimina exclusivamente su directorio temporal.

Las pruebas ejercitan el servidor real y la base real del proyecto. No usan mocks ni acceden a producción.

## Seguridad HTTP

Express dejará de exponer `X-Powered-By` y enviará:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`;
- `Content-Security-Policy` compatible con los scripts actuales, incluido el script inline del login;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

La CSP permitirá recursos propios, imágenes `data:` y estilos/scripts inline mientras el login mantenga su script embebido. No se amplía el acceso a APIs externas.

## Flujo de publicación

1. Trabajar en un worktree y una rama de preparación.
2. Ejecutar `npm ci`, pruebas, sintaxis y auditoría.
3. Revisar el diff completo contra `origin/master`.
4. Publicar la rama sin forzar historia.
5. En el servidor:
   - crear backup consistente de SQLite;
   - archivar la fuente activa;
   - transferir la versión verificada a un directorio de release;
   - instalar dependencias de producción;
   - ejecutar smoke test con una copia descartable de la base;
   - sustituir el código activo conservando `data/`;
   - reiniciar PM2 y comprobar HTTP.
6. Si health o smoke fallan, restaurar inmediatamente la fuente anterior y reiniciar PM2.

## Criterios de aceptación

- `npm test` finaliza con cero fallos.
- Los módulos backend y frontend pasan validación sintáctica.
- `npm audit` informa cero vulnerabilidades.
- Ninguna prueba lee o modifica la base operativa.
- GitHub contiene la rama consolidada y los 29 commits recuperados.
- La base de producción conserva su hash lógico e integridad antes y después del despliegue.
- El dominio oficial responde `200` en portada y catálogo, y `401` en rutas privadas sin sesión.
- PM2 queda online, sin reinicios inestables.
- Existe backup de código y datos anterior al despliegue, con rollback comprobable.

## Riesgos y mitigaciones

- **Pérdida de datos:** backup consistente y no reemplazar `data/`.
- **Diferencias entre drivers SQLite:** ejecutar pruebas con el driver disponible localmente y smoke remoto con el driver de producción.
- **CSP incompatible:** probar portada, login y sistema antes y después del despliegue.
- **Cambio de dependencias:** no usar `npm audit fix --force`; aceptar sólo cambios compatibles y repetir toda la suite.
- **Fallo al reiniciar:** conservar el release anterior y restaurarlo antes de abandonar el despliegue.
