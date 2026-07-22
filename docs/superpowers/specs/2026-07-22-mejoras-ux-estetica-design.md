# Mejoras de experiencia de usuario y estética (auditoría + implementación)

Fecha: 2026-07-22

## Contexto

El sistema tiene 7 pantallas (Vender, Caja, Stock, Productos, Gastos, Costos, Ajustes) montadas como SPA vanilla (`public/js/app.js` + un módulo por vista) sobre un único sistema de diseño en `public/styles.css` (paleta cálida marrón/verde/harina, identidad "El Sastre De La Pasta"). El sistema se usa a diario, en producción, desde tablet/celular/PC, por personas sin conocimientos técnicos.

Se pidió una auditoría de usabilidad/estética de las 7 pantallas y la implementación de las mejoras encontradas. La auditoría (hecha leyendo cada módulo JS y el CSS) encontró fricciones concretas de uso — no solo cuestiones visuales — descriptas abajo.

Dirección elegida: **evolución cálida**, no reskin. Se mantiene la identidad visual actual (paleta, marca, tono artesanal) y se resuelven los hallazgos de fricción, sumando pulido (foco/hover, elevación, jerarquía tipográfica) sin cambiar paleta ni tipografía base. Sin build step ni dependencias nuevas: sigue siendo HTML/CSS/JS vanilla servido tal cual por Express.

## Alcance

Incluido:
- **Vender**: agregado rápido de 1 unidad por tap directo en la ficha (sin modal) para productos que venden por unidad, con contador visual en la ficha mientras está en el carrito; ticket con edición in-line de cantidad (stepper para unidad/docena, reapertura del teclado prellenado para kg/monto) en vez de solo poder borrar y recargar.
- **Productos**: campo Categoría con autocompletado (`<input list>` + `<datalist>`) de las categorías ya cargadas, para evitar duplicados por mayúsculas/espacios.
- **Caja**: colores `pos-neg`/`pos-pos` consistentes en la tabla "¿De dónde viene la plata?".
- **Stock**: vista previa en vivo de los minutos de trabajo calculados desde receta en "Registrar producción" cuando el campo se deja vacío.
- **Costos**: aviso explicativo del costo indirecto colapsable, con estado recordado en `localStorage`.
- **Confirmaciones simples** (`confirmar()` de sí/no en `ui.js`): modal centrado angosto en vez de bottom-sheet completo.
- Buscador de texto simple (client-side, sobre lo ya cargado, sin nuevas llamadas a la API) en Vender y en Productos.
- Cross-cutting: estados de foco/hover visibles en todo elemento interactivo (`.btn`, `.chip`, `.ficha`, `.nav-btn`); preservar posición de scroll al recargar una vista en vez de perderla en cada `clear()`; color de categoría reflejado también en el chip de filtro (hoy solo en la ficha).
- Tokens nuevos en `styles.css`: niveles de elevación (`--sombra-1/2/3`), un paso extra de escala tipográfica para metadatos.

Fuera de alcance (no se resuelve en esta iteración):
- Cambio de paleta, tipografía de marca o iconografía de categorías (eso es la Opción 2 descartada, para una eventual segunda vuelta).
- Cualquier trabajo relacionado a "Pedidos por WhatsApp" (funcionalidad futura, documentada aparte para Stitch, no tiene código todavía).
- Build step (Vite/esbuild) — no hace falta para el alcance elegido.
- Tests automatizados (el proyecto no tiene suite; se verifica manualmente, ver abajo).

## Diseño

### Tokens (`public/styles.css`)

```css
--sombra-1: 0 1px 0 var(--borde-fuerte), 0 2px 6px rgba(46,31,23,.08);   /* fichas, chips */
--sombra-2: 0 2px 0 var(--borde-fuerte), 0 6px 18px rgba(46,31,23,.09);  /* paneles, kpis (= --sombra actual) */
--sombra-3: 0 -8px 30px rgba(0,0,0,.25);                                 /* modales (= sombra actual del modal) */
--texto-meta: .82rem;  /* un paso entre .85rem (th) y .95rem (ayuda), para metadatos de segundo orden */
```

`--sombra` se deja como alias de `--sombra-2` para no romper nada que ya lo use; los componentes se migran a los nombres nuevos donde corresponda.

Foco/hover (nuevo, aplica a `.btn`, `.chip`, `.ficha`, `.nav-btn`):
```css
.btn:hover, .chip:hover, .ficha:hover { filter: brightness(0.97); }
.btn:focus-visible, .chip:focus-visible, .ficha:focus-visible, .nav-btn:focus-visible {
  outline: 3px solid #1F4D3466; outline-offset: 2px;
}
```
Se usa `:focus-visible` (no `:focus`) para no mostrar el anillo en cada tap táctil, solo en navegación por teclado — así no molesta en el uso normal de mostrador.

### Vender (`public/js/vender.js`, `styles.css`)

**Estado del carrito por producto**: el carrito deja de ser solo un array de líneas; cada ficha consulta si el producto ya tiene una línea de modo `unidad` en el carrito para mostrar el contador.

**Tap en la ficha:**
- Si `p.vende_unidad`: busca una línea existente `{producto.id, modo:'unidad'}` en el carrito. Si existe, `cantidad++` y recalcula `importe`; si no existe, la crea con `cantidad=1`. Sin modal. Pulso visual breve (clase `.ficha-pulso`, animación CSS de 200ms) + se abre el cajón del ticket en mobile (reusa `abrirTicketMobile()`).
- Si NO vende por unidad (solo kg/docena/monto): tap abre el flujo actual sin cambios (selector de modo si hay más de uno, o teclado directo si hay uno solo).

**Botón secundario "⋯" en la ficha** (esquina, `stopPropagation` para no disparar el tap principal): abre siempre el flujo completo actual (selector de modo + teclado), para elegir docena/kg/monto o cargar una cantidad de unidad puntual distinta de "+1 a la vez" (ej. 6 de una sola vez). Se muestra solo si `modos.length > 1` — si el producto *solo* vende por unidad, el tap normal ya cubre todo el caso de uso (tocar varias veces suma cantidad) y el botón sería redundante.

**Contador en la ficha**: `<span class="ficha-badge">×N</span>` posicionado arriba a la derecha, visible solo si `N > 0`.

**Ticket editable** (`ticket()` en `vender.js`):
- Línea de modo `unidad` o `docena`: stepper in-line `[ − ] cantidad [ + ]` en vez de (o adicional a) el botón "×"; `−` en cantidad 1 quita la línea (mismo comportamiento que "×" hoy).
- Línea de modo `kg` o `monto`: tocar el texto del detalle (no el botón quitar) reabre `pedirCantidad` con el valor actual precargado en el visor, para ajustarlo sin borrar y recrear la línea.
- El botón "×" se mantiene en todos los casos como forma directa de quitar la línea completa.

### Productos (`public/js/productos.js`)

`inCat` deja de ser `input({...})` simple y pasa a incluir una lista de sugerencias:
```js
const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))];
const datalistId = 'categorias-existentes';
// <datalist id="categorias-existentes"> con un <option> por categoría
const inCat = input({ value: p.categoria, placeholder: 'Ej: Rellenas', list: datalistId });
```
El `<datalist>` se construye a partir de las categorías ya presentes en `productos` (variable de módulo ya disponible en `pintar()`/`abrirForm()`), sin llamada nueva a la API. Sigue siendo texto libre (se puede tipear una categoría nueva), pero el navegador sugiere las existentes — reduce, no elimina, el riesgo de duplicados por typo.

### Caja (`public/js/caja.js`)

La función `fila()` usada en el desglose "¿De dónde viene la plata?" acepta una clase opcional de signo, y las llamadas para gastos/compras en efectivo (que restan) pasan `pos-neg`, la de saldo inicial y ventas por medio quedan neutras, y `filaFuerte` (el total) usa `pos-pos`/`pos-neg` según el signo de `caja.caja_esperada` (mismo criterio que ya usa el KPI de la misma pantalla).

### Stock (`public/js/stock.js`)

En `formProduccion`, al perder foco el campo cantidad (o al cambiar de producto), si `inMin.value === ''` se calcula y muestra bajo el campo un texto auxiliar: `minutos estimados = producto.minutos_mano_obra * cantidad` (el dato `minutos_mano_obra` ya viene en el objeto `producto` cargado). Es solo un texto informativo (`campo(..., ayuda)`), no cambia qué se manda al guardar (sigue siendo automático en el backend si `minutos` no viene en el body).

### Costos (`public/js/reportes.js`)

El `div.aviso` pasa a tener un botón "×" que lo oculta y guarda `localStorage.setItem('costos_aviso_oculto', '1')`; al entrar a la vista, si esa clave está seteada, el aviso no se renderiza. Sin cambios de backend.

### Confirmaciones (`public/js/ui.js`, `styles.css`)

`confirmar()` pasa un flag/clase al modal (`modal({ ..., chico: true })` o una clase `.modal-chico`) que en CSS fija `max-width: 360px` y quita el comportamiento de bottom-sheet en mobile (queda centrado con `align-items: center` siempre, no solo en `min-width:700px`). El uso de `modal()` para formularios reales no cambia.

### Buscador de texto (Vender y Productos)

Un `<input>` simple arriba de los chips (Vender) o de la tabla (Productos), que filtra client-side por `nombre` (case/acento-insensible, `.toLocaleLowerCase()`) sobre el array ya cargado en memoria — no dispara requests nuevos. En Vender convive con el filtro de categoría (ambos se aplican juntos).

### Preservar scroll al recargar

Helper chico en `ui.js`:
```js
export function conScroll(cont, fn) {
  const y = cont.scrollTop ?? window.scrollY;
  fn();
  requestAnimationFrame(() => { (cont.scrollTop != null ? cont : window).scrollTo?.(0, y); });
}
```
Se usa envolviendo los `pintar(cont, ...)` que se llaman desde una acción de "recargar" (no en el montaje inicial de la vista, donde arrancar arriba es lo esperado). Aplica en Stock, Productos y Caja, que son las vistas con listas largas y recargas frecuentes tras guardar algo.

### Color de categoría en el chip

En `vender.js`, el chip de cada categoría (no el de "Todos") suma un borde superior de 3px con `colorCategoria(cat)`, usando la misma función ya existente en `ui.js` — mismo color que la franja de la ficha de esa categoría.

## Testing / verificación

No hay suite automatizada (igual que en trabajos anteriores del proyecto). Verificación manual tras implementar, en una rama aparte, antes de mergear a `master`:

- Vender: tocar una ficha de un producto por unidad varias veces seguidas → la misma línea incrementa cantidad, sin abrir modal; el contador de la ficha coincide con la cantidad en el ticket. Tocar "⋯" abre el selector completo. Producto que solo vende por kg/monto sigue abriendo el teclado directo al tocar la ficha.
- Ticket: stepper `−`/`+` en una línea de unidad/docena cambia cantidad e importe correctamente; llegar a 0 quita la línea. Tocar el detalle de una línea de kg/monto reabre el teclado con el valor precargado y permite corregirlo.
- Productos: escribir una categoría nueva se acepta igual que hoy; el campo sugiere las categorías ya usadas al tipear.
- Caja: forzar un período con gastos/compras en efectivo y confirmar que se ven en rojo, y que el total (`Efectivo que deberías tener`) se ve en rojo si da negativo, verde si da positivo.
- Stock: en "Registrar producción", dejar minutos vacío y confirmar que el texto de ayuda muestra el cálculo esperado (`minutos_mano_obra × cantidad`) al elegir producto/cantidad.
- Costos: cerrar el aviso, recargar la página, confirmar que no vuelve a aparecer; limpiar `localStorage` y confirmar que vuelve.
- Confirmar (sí/no) se ve como modal chico centrado en desktop y en mobile, no como bottom-sheet.
- Buscador de texto en Vender y Productos filtra en vivo sin parpadeo ni requests nuevos (revisar Network tab).
- Recargar Stock/Productos/Caja después de guardar algo con la lista scrolleada hacia abajo → la posición se mantiene, no vuelve al top.
- Recorrido general de foco por teclado (Tab) en las 7 pantallas: todo botón/chip/ficha muestra un anillo de foco visible; no aparece al hacer tap táctil normal.

El usuario prueba en la web él mismo tras el desarrollo, antes de aprobar el merge a `master`.

## Notas

Este documento parte de la auditoría conversada en esta misma sesión (11 hallazgos priorizados) y de la Opción 1 ("evolución cálida") elegida sobre las 3 alternativas presentadas. Complementa, sin superponerse, el brief de Stitch armado antes (que cubre una funcionalidad futura de pedidos por WhatsApp, fuera de alcance acá).
