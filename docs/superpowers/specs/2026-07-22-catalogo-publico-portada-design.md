# Catálogo público y CTA de WhatsApp en la portada

Fecha: 2026-07-22

## Contexto

La portada institucional (`public/index.html`, ver [`2026-07-05-portada-institucional-design.md`](2026-07-05-portada-institucional-design.md)) se lanzó a propósito solo con contenido institucional (logo, dirección, horarios, WhatsApp, Instagram, link de login). Ese spec dejó explícitamente fuera de alcance el "catálogo de productos con precios en la portada", con la idea de agregarlo más adelante.

Hoy la portada no le da al visitante ninguna razón para volver o para saber qué se vende sin escribir primero por WhatsApp a ciegas. El pedido: mostrar el catálogo con precios y facilitar el pedido, reutilizando el sistema existente (no un sitio aparte).

Hoy **todas** las rutas `/api/*` requieren sesión (`app.use('/api', requireAuth)` en `server.js`), así que no existe ninguna forma de que la portada pública consuma datos de productos sin agregar una ruta nueva sin autenticación.

## Alcance

Incluido:
- Nuevo endpoint público de solo lectura `GET /api/publico/productos`.
- Botón CTA de WhatsApp genérico ("Hacé tu pedido") en la portada.
- Catálogo de productos en la portada, agrupado por categoría con chips filtrables (mismo patrón visual que la pantalla Vender interna).
- Aviso "Sin stock" en productos con stock 0 (se muestran igual, no se ocultan).

Fuera de alcance (no se toca en este trabajo):
- Fotos de producto (la tabla `producto` no tiene ese campo; si se quiere más adelante, es un spec aparte que agrega el campo, la carga de archivos y una pantalla en Productos).
- Link de WhatsApp por producto individual (solo el botón general).
- Carrito o cualquier flujo de compra en la portada — el pedido se sigue cerrando por WhatsApp, a mano.
- Agente de WhatsApp automatizado / generador de imágenes para redes (Fase 2 del README, requiere aprobación de Meta y sigue sin empezar).
- Cambios al esquema de roles, login, o a las vistas internas (Vender, Caja, Stock, Productos, Gastos, Costos, Ajustes).
- Soporte multi-sucursal en la portada (se asume sucursal única, `sucursal_id = 1`, igual que el resto del sistema hoy).

## Diseño

### Backend: `GET /api/publico/productos`

Se monta en `server.js` **antes** de la línea `app.use('/api', requireAuth)` (línea 43), junto a donde `auth.montar(app)` registra `/api/login`, `/api/logout` y `/api/me` — mismo mecanismo por el que esas rutas ya quedan exentas de sesión.

Query: `SELECT * FROM producto WHERE sucursal_id = 1 AND activo = 1 ORDER BY categoria, nombre` (mismo criterio que ya usa `/api/productos`, sucursal fija en 1 porque no hay sesión de la que derivar la sucursal).

Por cada fila, la respuesta expone **únicamente**:
- `nombre` (string)
- `categoria` (string)
- `precioTexto` (string) — calculado con una función compartida `precioTextoDe(producto)` que replica la prioridad ya usada en `public/js/vender.js` (`ficha()`): `vende_unidad && precio_unidad` → `"$X c/u"`; si no, `vende_kg && precio_kg` → `"$X /kg"`; si no, `vende_docena && precio_docena` → `"$X /doc"`; si ninguna aplica → `null` (el frontend lo trata como "Sin precio", igual que hoy en Vender).
- `disponible` (boolean) — `stock > 0`.

Explícitamente **no** se exponen: `id`, `costo_compra`, `minutos_mano_obra`, `receta`, `codigo_barra`, el `stock` numérico exacto, ni ningún campo de costo o margen. El objetivo es que este endpoint no sirva para inferir información interna del negocio.

`precioTextoDe()` se extrae como función reutilizable en el backend (hoy la lógica de prioridad de precio solo existe en el frontend, en `vender.js`); el backend la necesita para construir `precioTexto` en la respuesta pública.

### Frontend: `public/index.html` + `public/js/portada.js`

Orden de la página (de arriba a abajo):

1. Logo, nombre y rubro — sin cambios.
2. Panel institucional (dirección, horarios, WhatsApp, Instagram) — sin cambios.
3. **Botón CTA**: "🍝 Hacé tu pedido por WhatsApp", link a `https://wa.me/5493444525595?text=` + mensaje genérico codificado (`Hola! Quiero hacer un pedido`). Estilo `.btn`, destacado (fondo vino, ancho generoso), ubicado entre el panel institucional y el catálogo.
4. **Catálogo**:
   - Chips de categoría: `['Todos', ...categorías detectadas]`, mismo patrón que `vender.js` (`categoriaActiva`, click para filtrar y re-renderizar), reutilizando las clases CSS `.chips`/`.chip` ya existentes (con el fix de bordes ya aplicado).
   - Tarjetas de producto: versión simplificada de `.ficha` — barra de color lateral por categoría (`colorCategoria`, ya existe en `ui.js`), nombre, precio (`precioTexto` o "Sin precio"), y badge "Sin stock" cuando `disponible === false`. Sin botón "+", sin `onClick` de agregar — son informativas, no interactivas (no hay carrito en la portada).
5. Link "Ingresar (administradores y empleados)" — sin cambios, al final.

**Archivo nuevo `public/js/portada.js`** (módulo ES, sin build step, mismo estilo que el resto del proyecto):
- `fetch('/api/publico/productos')` sin credenciales especiales (no hace falta, la ruta no pide sesión).
- Reutiliza `el`, `money`, `colorCategoria` de `ui.js` (ya se usan en `vender.js` con el mismo propósito).
- Mantiene el filtro por categoría en estado local del módulo (`categoriaActiva`), igual que `vender.js`.

`index.html` agrega el `<script type="module" src="/js/portada.js"></script>` y un contenedor vacío (`<div id="catalogo"></div>`) donde `portada.js` inyecta chips + tarjetas al cargar.

### Manejo de errores

Si el `fetch` falla (red, servidor momentáneamente caído, respuesta no 200), el contenedor `#catalogo` muestra un mensaje simple: "No se pudo cargar el catálogo. Escribinos por WhatsApp." — usando la clase `.vacio` ya existente. El resto de la portada (logo, panel institucional, botón CTA de WhatsApp) no depende del catálogo y sigue mostrándose igual, porque es HTML estático que ya está en la página antes de que corra el fetch.

### Testing / verificación

Sin suite de tests automatizados en el proyecto (igual que el resto). Verificación manual:
- `curl http://localhost:3000/api/publico/productos` **sin** cookie de sesión → debe responder 200 con la lista (no 401), y los campos deben ser exactamente `nombre`, `categoria`, `precioTexto`, `disponible` (nada de costos, ids, stock numérico).
- Cargar `/` en el navegador:
  - El botón de WhatsApp abre un chat con el mensaje pre-armado.
  - Los chips filtran las tarjetas correctamente, "Todos" muestra todo.
  - Un producto con stock 0 muestra el aviso "Sin stock" en vez de desaparecer.
  - El resto de la portada (institucional, login) sigue funcionando igual que antes.
- Simular una falla del endpoint (por ejemplo, parar el server un instante o forzar un error) y confirmar que el resto de la portada se sigue viendo bien con el mensaje de fallback en el catálogo.

## Notas

Este trabajo no toca `/api/productos` (la ruta autenticada que usa el sistema interno) ni ninguna vista interna — es aditivo: una ruta nueva de solo lectura y cambios acotados a `public/index.html` + un archivo nuevo `public/js/portada.js`.
