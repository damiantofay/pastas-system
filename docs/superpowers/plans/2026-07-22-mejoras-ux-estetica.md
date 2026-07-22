# Mejoras de experiencia de usuario y estética Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver los 11 hallazgos de la auditoría de UX/estética de las 7 pantallas de "El Sastre de la Pasta" — agregado rápido y ticket editable en Vender, autocompletado de categoría y buscador en Productos, consistencia de colores en Caja, vista previa de minutos en Stock, aviso colapsable en Costos, confirmaciones más livianas, foco/hover visibles y scroll persistente en todo el sistema — sin cambiar paleta, tipografía ni introducir build step.

**Architecture:** Todo el trabajo es frontend (`public/styles.css` + módulos en `public/js/`), sin cambios de esquema ni de API. Se extiende el sistema de tokens CSS existente (nuevos niveles de sombra, foco/hover) y se agregan dos helpers reutilizables en `public/js/ui.js` (`conScroll` para no perder la posición de scroll al recargar, y la opción `chico` de `modal()` para confirmaciones livianas). El resto son cambios puntuales por módulo de vista, reusando siempre los helpers ya existentes (`el`, `modal`, `campo`, `toast`, `API.*`).

**Tech Stack:** HTML/CSS/JS vanilla servido tal cual por Express (sin bundler, sin dependencias nuevas). Node.js + Express + better-sqlite3 ya existentes, sin cambios.

## Global Constraints

- Todo el trabajo se hace en la rama `mejoras-ux-2026-07`, creada desde `master` antes de la Task 1. No se mergea a `master` ni se reinicia pm2 hasta que el usuario confirme explícitamente tras probar en el navegador (ver Task 10).
- No se toca paleta de colores, tipografía base, ni marca — solo se agregan tokens de elevación (`--sombra-1/2/3`) y un paso tipográfico (`--texto-meta`), evolución del sistema existente.
- Sin build step ni dependencias npm nuevas. Sigue siendo JS con módulos ES nativos del navegador.
- El proyecto no tiene framework de tests automatizados: toda verificación es manual, en el navegador, contra `npm start` local — igual que en `docs/superpowers/plans/2026-07-07-codigo-de-barras-productos.md`.
- No modificar `server.js`, `db.js`, `auth.js`, ni el esquema de datos — este trabajo es 100% frontend.
- No modificar `public/js/gastos.js` ni `public/js/ajustes.js` — la auditoría no encontró hallazgos ahí.
- Reusar siempre los helpers ya existentes de `ui.js` (`el`, `clear`, `money`, `numAR`, `modal`, `cerrarModal`, `input`, `select`, `campo`, `toast`, `confirmar`, `colorCategoria`) sin duplicarlos.
- Todo texto de interfaz en español, siguiendo el estilo ya usado en el proyecto.

---

### Task 1: Tokens de elevación, foco/hover y componentes nuevos (`public/styles.css`)

**Files:**
- Modify: `public/styles.css`
- Test: verificación manual sirviendo el archivo y revisando visualmente en el navegador (las clases nuevas se usan recién en tasks siguientes; acá se verifica que el CSS es válido y se sirve bien)

**Interfaces:**
- Produces (usado por Task 2, 3, 4, 9): variables `--sombra-1`, `--sombra-2`, `--sombra-3`, `--texto-meta`; clases `.ficha-badge`, `.ficha-mas`, `.ficha-pulso`, `.modal-fondo.chico`; regla `border-top` en `.chip` para el acento de categoría; estados `:hover`/`:focus-visible` en `.btn`, `.chip`, `.ficha`, `.nav-btn`.

- [ ] **Step 1: Crear la rama de trabajo**

```bash
cd /home/claudeuser/work/fabrica-pastas
git checkout -b mejoras-ux-2026-07
```

Expected: `Switched to a new branch 'mejoras-ux-2026-07'`

- [ ] **Step 2: Agregar los tokens de elevación y tipografía**

Ubicar en `public/styles.css`:

```css
  --r:    16px;
  --r-sm: 10px;
  --sombra: 0 2px 0 var(--borde-fuerte), 0 6px 18px rgba(46,31,23,.09);
  --tap: 60px;

  --fuente: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
}
```

Reemplazar por:

```css
  --r:    16px;
  --r-sm: 10px;
  --sombra: 0 2px 0 var(--borde-fuerte), 0 6px 18px rgba(46,31,23,.09);
  --sombra-1: 0 1px 0 var(--borde-fuerte), 0 2px 6px rgba(46,31,23,.08);
  --sombra-2: var(--sombra);
  --sombra-3: 0 -8px 30px rgba(0,0,0,.25);
  --tap: 60px;

  --fuente: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
  --texto-meta: .82rem;
}
```

- [ ] **Step 3: Agregar estados de foco/hover**

Ubicar:

```css
.btn:disabled{ opacity:.45; cursor:not-allowed; }
.btn-chico{ min-height:44px; padding:0 14px; font-size:.95rem; }

.fila-botones{ display:flex; gap:12px; flex-wrap:wrap; }
```

Reemplazar por:

```css
.btn:disabled{ opacity:.45; cursor:not-allowed; }
.btn-chico{ min-height:44px; padding:0 14px; font-size:.95rem; }

.btn:hover, .chip:hover, .ficha:hover{ filter:brightness(0.97); }
.btn:focus-visible, .chip:focus-visible, .ficha:focus-visible, .nav-btn:focus-visible{
  outline:3px solid #1F4D3466; outline-offset:2px;
}

.fila-botones{ display:flex; gap:12px; flex-wrap:wrap; }
```

- [ ] **Step 4: Acento de categoría en el chip + badge/pulso/botón "más" en la ficha**

Ubicar:

```css
.chips{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
.chip{ min-height:52px; padding:0 20px; border-radius:30px; border:2px solid var(--borde-fuerte); background:var(--panel); font-weight:700; font-size:1.02rem; color:var(--vino); }
.chip.activo{ background:var(--vino); color:#fff; border-color:var(--vino); }
```

Reemplazar por:

```css
.chips{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
.chip{ min-height:52px; padding:0 20px; border-radius:30px; border:2px solid var(--borde-fuerte); border-top:3px solid transparent; background:var(--panel); font-weight:700; font-size:1.02rem; color:var(--vino); }
.chip.activo{ background:var(--vino); color:#fff; border-color:var(--vino); }
```

Ubicar:

```css
/* ---------- POS: fichas de producto ---------- */
.pos{ display:grid; grid-template-columns:1fr 360px; gap:22px; align-items:start; }
.fichas{ display:grid; grid-template-columns:repeat(auto-fill, minmax(160px,1fr)); gap:14px; }
.ficha{
  position:relative; min-height:120px; border-radius:var(--r);
  border:1px solid var(--borde-fuerte); background:var(--panel);
  box-shadow:var(--sombra); padding:14px; text-align:left;
  display:flex; flex-direction:column; justify-content:space-between;
  font-family:inherit;
}
.ficha:active{ transform:translateY(1px); }
.ficha-nombre{ font-weight:800; font-size:1.08rem; color:var(--tinta); }
.ficha-cat{ position:absolute; top:0; left:0; width:8px; height:100%; border-radius:var(--r) 0 0 var(--r); }
.ficha-precio{ color:var(--vino); font-weight:700; font-size:.98rem; }
.ficha-stock{ font-size:.82rem; color:var(--tinta-suave); margin-top:2px; }
.ficha-stock.bajo{ color:var(--tomate); font-weight:700; }
```

Reemplazar por:

```css
/* ---------- POS: fichas de producto ---------- */
.pos{ display:grid; grid-template-columns:1fr 360px; gap:22px; align-items:start; }
.fichas{ display:grid; grid-template-columns:repeat(auto-fill, minmax(160px,1fr)); gap:14px; }
.ficha{
  position:relative; min-height:120px; border-radius:var(--r);
  border:1px solid var(--borde-fuerte); background:var(--panel);
  box-shadow:var(--sombra-1); padding:14px; text-align:left;
  display:flex; flex-direction:column; justify-content:space-between;
  font-family:inherit;
}
.ficha:active{ transform:translateY(1px); }
.ficha-nombre{ font-weight:800; font-size:1.08rem; color:var(--tinta); }
.ficha-cat{ position:absolute; top:0; left:0; width:8px; height:100%; border-radius:var(--r) 0 0 var(--r); }
.ficha-precio{ color:var(--vino); font-weight:700; font-size:.98rem; }
.ficha-stock{ font-size:.82rem; color:var(--tinta-suave); margin-top:2px; }
.ficha-stock.bajo{ color:var(--tomate); font-weight:700; }
.ficha-badge{
  position:absolute; top:-8px; right:-8px; min-width:26px; height:26px; padding:0 6px;
  border-radius:20px; background:var(--masa); color:#fff; font-weight:800; font-size:.85rem;
  display:flex; align-items:center; justify-content:center; box-shadow:var(--sombra-1);
}
.ficha-mas{
  position:absolute; top:6px; right:6px; width:30px; height:30px; border-radius:8px;
  border:1px solid var(--borde-fuerte); background:var(--panel); color:var(--tinta-suave);
  font-weight:800; font-size:1.1rem; display:flex; align-items:center; justify-content:center;
}
@keyframes fichaPulso{ 0%{ transform:scale(1); } 40%{ transform:scale(1.04); } 100%{ transform:scale(1); } }
.ficha-pulso{ animation:fichaPulso .2s ease-out; }
```

- [ ] **Step 5: Modal chico (para confirmaciones) y token de sombra en el modal**

Ubicar:

```css
#modal-root:empty{ display:none; }
.modal-fondo{ position:fixed; inset:0; background:rgba(26,26,26,.5); display:flex; align-items:flex-end; justify-content:center; padding:0; z-index:50; }
.modal{ background:var(--panel); width:100%; max-width:560px; border-radius:20px 20px 0 0; padding:20px; max-height:92vh; overflow:auto; box-shadow:0 -8px 30px rgba(0,0,0,.25); }
.modal h2{ margin-top:0; }
.modal-acciones{ display:flex; gap:12px; margin-top:18px; }
.modal-acciones .btn{ flex:1; }
@media(min-width:700px){
  .modal-fondo{ align-items:center; padding:20px; }
  .modal{ border-radius:20px; }
}
```

Reemplazar por:

```css
#modal-root:empty{ display:none; }
.modal-fondo{ position:fixed; inset:0; background:rgba(26,26,26,.5); display:flex; align-items:flex-end; justify-content:center; padding:0; z-index:50; }
.modal{ background:var(--panel); width:100%; max-width:560px; border-radius:20px 20px 0 0; padding:20px; max-height:92vh; overflow:auto; box-shadow:var(--sombra-3); }
.modal h2{ margin-top:0; }
.modal-acciones{ display:flex; gap:12px; margin-top:18px; }
.modal-acciones .btn{ flex:1; }
@media(min-width:700px){
  .modal-fondo{ align-items:center; padding:20px; }
  .modal{ border-radius:20px; }
}
.modal-fondo.chico{ align-items:center; padding:20px; }
.modal-fondo.chico .modal{ border-radius:20px; max-width:360px; }
```

- [ ] **Step 6: Verificar que el CSS se sirve sin errores**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
curl -s http://localhost:3000/styles.css | grep -E "sombra-1|ficha-badge|ficha-mas|modal-fondo.chico" | head -10
kill %1
```

Expected: las 4 cadenas buscadas aparecen en la salida (confirma que el archivo se sirve completo y con las reglas nuevas).

- [ ] **Step 7: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/styles.css
git commit -m "Agregar tokens de elevacion, foco/hover y estilos para agregado rapido y modal chico"
```

---

### Task 2: Helpers de scroll persistente y modal chico (`public/js/ui.js`)

**Files:**
- Modify: `public/js/ui.js`

**Interfaces:**
- Consumes: clase `.modal-fondo.chico` de Task 1.
- Produces (usado por Task 4, 5, 6, 7, 9): `conScroll(fn: () => void | Promise<void>): Promise<void>` — ejecuta `fn`, esperando si es async, y restaura la posición de scroll de la página a como estaba antes de llamarlo. `modal({ title, body, actions, chico? })` — nuevo parámetro opcional `chico` (default `false`). `confirmar()` ahora usa `chico: true` internamente.

- [ ] **Step 1: Agregar `conScroll`**

Ubicar en `public/js/ui.js`:

```javascript
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
```

Reemplazar por:

```javascript
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// Mantiene la posicion de scroll de la pagina al volver a pintar una vista
// (evita el salto al principio que produce clear()+appendChild en listas largas).
export async function conScroll(fn) {
  const y = window.scrollY;
  await fn();
  requestAnimationFrame(() => window.scrollTo(0, y));
}
```

- [ ] **Step 2: Agregar el parámetro `chico` a `modal()`**

Ubicar:

```javascript
export function modal({ title, body, actions }) {
  const root = document.getElementById('modal-root');
  clear(root);
  const cont = el('div', { class: 'modal' }, [
    title ? el('h2', { text: title }) : null,
    body
  ]);
  if (actions && actions.length) {
    cont.appendChild(el('div', { class: 'modal-acciones' }, actions));
  }
  const fondo = el('div', { class: 'modal-fondo', onClick: (e) => { if (e.target === fondo) cerrarModal(); } }, [cont]);
  root.appendChild(fondo);
  return cont;
}
```

Reemplazar por:

```javascript
export function modal({ title, body, actions, chico = false }) {
  const root = document.getElementById('modal-root');
  clear(root);
  const cont = el('div', { class: 'modal' }, [
    title ? el('h2', { text: title }) : null,
    body
  ]);
  if (actions && actions.length) {
    cont.appendChild(el('div', { class: 'modal-acciones' }, actions));
  }
  const fondo = el('div', { class: 'modal-fondo' + (chico ? ' chico' : ''), onClick: (e) => { if (e.target === fondo) cerrarModal(); } }, [cont]);
  root.appendChild(fondo);
  return cont;
}
```

- [ ] **Step 3: Usar `chico: true` en `confirmar()`**

Ubicar:

```javascript
export function confirmar(mensaje, { textoOk = 'Sí', textoNo = 'No', peligro = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title: mensaje,
      body: el('div'),
      actions: [
        el('button', { class: 'btn btn-fantasma', text: textoNo, onClick: () => { cerrarModal(); resolve(false); } }),
        el('button', { class: 'btn ' + (peligro ? 'btn-rojo' : 'btn-primario'), text: textoOk, onClick: () => { cerrarModal(); resolve(true); } })
      ]
    });
  });
}
```

Reemplazar por:

```javascript
export function confirmar(mensaje, { textoOk = 'Sí', textoNo = 'No', peligro = false } = {}) {
  return new Promise((resolve) => {
    modal({
      title: mensaje,
      body: el('div'),
      chico: true,
      actions: [
        el('button', { class: 'btn btn-fantasma', text: textoNo, onClick: () => { cerrarModal(); resolve(false); } }),
        el('button', { class: 'btn ' + (peligro ? 'btn-rojo' : 'btn-primario'), text: textoOk, onClick: () => { cerrarModal(); resolve(true); } })
      ]
    });
  });
}
```

- [ ] **Step 4: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En el navegador: iniciar sesión, ir a Gastos, cargar un gasto de prueba, y tocar "Borrar" en él. Confirmar que el diálogo de confirmación aparece ahora **centrado y angosto** (no como cajón que sube desde abajo), tanto en el ancho de escritorio como achicando la ventana a un ancho de celular. Cancelar (no borrar de verdad). Confirmar que el resto de los modales (por ejemplo "+ Nuevo gasto") se siguen viendo como antes (bottom-sheet).

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/ui.js
git commit -m "Agregar helper conScroll y modal chico para confirmaciones"
```

---

### Task 3: Vender — agregado rápido con contador y botón "más opciones"

**Files:**
- Modify: `public/js/vender.js`

**Interfaces:**
- Consumes: clases `.ficha-badge`, `.ficha-mas`, `.ficha-pulso` de Task 1.
- Produces (usado por Task 4): `lineaUnidadDe(p)` — busca la línea de modo `unidad` de un producto en el carrito. La función `aceptar()` interna de `pedirCantidad` ahora fusiona (en vez de duplicar) líneas de modo `unidad`/`docena` ya existentes para el mismo producto.

- [ ] **Step 1: Agregar `lineaUnidadDe` y `agregarUnidadRapida`, y reescribir `ficha()`**

Ubicar en `public/js/vender.js`:

```javascript
function ficha(p, main) {
  const modos = modosDe(p);
  let precioTxt = '';
  if (p.vende_unidad && p.precio_unidad) precioTxt = money(p.precio_unidad) + ' c/u';
  else if (p.vende_kg && p.precio_kg) precioTxt = money(p.precio_kg) + ' /kg';
  else if (p.vende_docena && p.precio_docena) precioTxt = money(p.precio_docena) + ' /doc';

  const bajo = p.stock <= 0;
  return el('button', { class: 'ficha', onClick: () => abrirAgregar(p, main) }, [
    el('span', { class: 'ficha-cat', style: { background: colorCategoria(p.categoria) } }),
    el('div', { class: 'ficha-nombre', text: p.nombre }),
    el('div', {}, [
      el('div', { class: 'ficha-precio', text: precioTxt || 'Sin precio' }),
      el('div', { class: 'ficha-stock' + (bajo ? ' bajo' : ''), text:
        `Stock: ${numAR(p.stock, p.unidad_stock === 'kg' ? 1 : 0)} ${p.unidad_stock === 'kg' ? 'kg' : 'u'}` })
    ])
  ]);
}
```

Reemplazar por:

```javascript
function lineaUnidadDe(p) {
  return carrito.find((it) => it.producto.id === p.id && it.modo === 'unidad');
}

function agregarUnidadRapida(p, main, fichaEl) {
  const importeUnidad = precioPreview(p, 'unidad', 1, 0);
  if (importeUnidad <= 0) { toast(`Falta el precio de "${p.nombre}"`, 'error'); return; }
  const linea = lineaUnidadDe(p);
  if (linea) { linea.cantidad += 1; linea.importe = precioPreview(p, 'unidad', linea.cantidad, 0); }
  else carrito.push({ producto: p, modo: 'unidad', cantidad: 1, importe: importeUnidad });
  if (fichaEl) { fichaEl.classList.remove('ficha-pulso'); void fichaEl.offsetWidth; fichaEl.classList.add('ficha-pulso'); }
  render(main);
  abrirTicketMobile();
}

function ficha(p, main) {
  const modos = modosDe(p);
  let precioTxt = '';
  if (p.vende_unidad && p.precio_unidad) precioTxt = money(p.precio_unidad) + ' c/u';
  else if (p.vende_kg && p.precio_kg) precioTxt = money(p.precio_kg) + ' /kg';
  else if (p.vende_docena && p.precio_docena) precioTxt = money(p.precio_docena) + ' /doc';

  const bajo = p.stock <= 0;
  const linea = lineaUnidadDe(p);
  const nodo = el('button', {
    class: 'ficha',
    onClick: () => { if (p.vende_unidad) agregarUnidadRapida(p, main, nodo); else abrirAgregar(p, main); }
  }, [
    el('span', { class: 'ficha-cat', style: { background: colorCategoria(p.categoria) } }),
    linea ? el('span', { class: 'ficha-badge', text: '×' + numAR(linea.cantidad, 0) }) : null,
    (modos.length > 1 && p.vende_unidad) ? el('button', {
      class: 'ficha-mas', title: 'Más opciones', text: '⋯',
      onClick: (e) => { e.stopPropagation(); abrirAgregar(p, main); }
    }) : null,
    el('div', { class: 'ficha-nombre', text: p.nombre }),
    el('div', {}, [
      el('div', { class: 'ficha-precio', text: precioTxt || 'Sin precio' }),
      el('div', { class: 'ficha-stock' + (bajo ? ' bajo' : ''), text:
        `Stock: ${numAR(p.stock, p.unidad_stock === 'kg' ? 1 : 0)} ${p.unidad_stock === 'kg' ? 'kg' : 'u'}` })
    ])
  ]);
  return nodo;
}
```

- [ ] **Step 2: Fusionar líneas de modo `unidad`/`docena` al agregar desde el modal completo**

Ubicar:

```javascript
  const aceptar = () => {
    const n = parseFloat(valor || '0') || 0;
    if (n <= 0) { toast('Ingresá una cantidad', 'error'); return; }
    const cant = esMonto ? 0 : n;
    const monto = esMonto ? n : 0;
    const importe = precioPreview(p, modo, cant, monto);
    if (importe <= 0) { toast(`Falta el precio de "${p.nombre}"`, 'error'); return; }
    carrito.push({ producto: p, modo, cantidad: cant, importe });
    cerrarModal();
    render(main);
    abrirTicketMobile();
  };
```

Reemplazar por:

```javascript
  const aceptar = () => {
    const n = parseFloat(valor || '0') || 0;
    if (n <= 0) { toast('Ingresá una cantidad', 'error'); return; }
    const cant = esMonto ? 0 : n;
    const monto = esMonto ? n : 0;
    const importe = precioPreview(p, modo, cant, monto);
    if (importe <= 0) { toast(`Falta el precio de "${p.nombre}"`, 'error'); return; }
    const existente = !esMonto && carrito.find((it) => it.producto.id === p.id && it.modo === modo);
    if (existente) { existente.cantidad = cant; existente.importe = importe; }
    else carrito.push({ producto: p, modo, cantidad: cant, importe });
    cerrarModal();
    render(main);
    abrirTicketMobile();
  };
```

- [ ] **Step 3: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En Vender, tocar una ficha de un producto que venda por unidad: debe agregarse al ticket sin abrir ningún modal, con un pulso visual breve, y debe aparecer un contador `×1` sobre la ficha. Tocarla de nuevo: el contador pasa a `×2` y el ticket muestra una sola línea con cantidad 2 (no dos líneas separadas). Si el producto también vende por kilo/docena/monto, debe verse el botón "⋯" en la esquina; tocarlo abre el selector de modo completo como antes. Un producto que solo vende por kilo o monto debe seguir abriendo el teclado directo al tocar la ficha, sin contador ni botón "⋯". Un producto sin precio configurado debe mostrar el toast de error al tocar la ficha, sin agregarse.

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/vender.js
git commit -m "Agregar agregado rapido por tap y contador en la ficha de Vender"
```

---

### Task 4: Vender — ticket con edición in-line

**Files:**
- Modify: `public/js/vender.js`, `public/styles.css`

**Interfaces:**
- Consumes: `lineaUnidadDe`/carrito fusionado de Task 3.
- Produces: `pedirCantidad(p, modo, main, itemExistente?)` — cuarto parámetro opcional; si se pasa, `aceptar()` actualiza esa línea en vez de crear/fusionar una nueva.

- [ ] **Step 1: Agregar el estilo del stepper del ticket**

Ubicar en `public/styles.css`:

```css
.titem-quitar{ border:none; background:var(--warn-bg); color:var(--tomate); width:40px; height:40px; border-radius:8px; font-size:1.3rem; font-weight:800; }
```

Reemplazar por:

```css
.titem-quitar{ border:none; background:var(--warn-bg); color:var(--tomate); width:40px; height:40px; border-radius:8px; font-size:1.3rem; font-weight:800; }
.titem-stepper{ display:flex; align-items:center; gap:8px; margin-top:2px; }
.titem-stepper .btn{ min-height:32px; padding:0 10px; font-size:1rem; }
.titem-stepper span{ min-width:44px; text-align:center; font-weight:700; color:var(--tinta-suave); font-size:var(--texto-meta); }
```

- [ ] **Step 2: Actualizar `pedirCantidad` para soportar edición de una línea existente**

Ubicar en `public/js/vender.js`:

```javascript
function pedirCantidad(p, modo, main) {
  const esMonto = modo === 'monto';
  const esKg = modo === 'kg';
  const decimales = esMonto || esKg;
  let valor = '';

  const visor = el('div', { class: 'visor', text: esMonto ? '$ 0' : '0' });
  const refrescar = () => {
    const n = parseFloat(valor || '0') || 0;
    visor.textContent = esMonto ? money(n) : numAR(n, decimales ? 3 : 0) + (esKg ? ' kg' : esMonto ? '' : ' u');
  };
```

Reemplazar por:

```javascript
function pedirCantidad(p, modo, main, itemExistente) {
  const esMonto = modo === 'monto';
  const esKg = modo === 'kg';
  const decimales = esMonto || esKg;
  let valor = itemExistente ? String(esMonto ? itemExistente.importe : itemExistente.cantidad) : '';

  const visor = el('div', { class: 'visor', text: '' });
  const refrescar = () => {
    const n = parseFloat(valor || '0') || 0;
    visor.textContent = esMonto ? money(n) : numAR(n, decimales ? 3 : 0) + (esKg ? ' kg' : esMonto ? '' : ' u');
  };
  refrescar();
```

- [ ] **Step 3: Usar `itemExistente` en `aceptar()`**

Ubicar (código dejado por la Task 3):

```javascript
  const aceptar = () => {
    const n = parseFloat(valor || '0') || 0;
    if (n <= 0) { toast('Ingresá una cantidad', 'error'); return; }
    const cant = esMonto ? 0 : n;
    const monto = esMonto ? n : 0;
    const importe = precioPreview(p, modo, cant, monto);
    if (importe <= 0) { toast(`Falta el precio de "${p.nombre}"`, 'error'); return; }
    const existente = !esMonto && carrito.find((it) => it.producto.id === p.id && it.modo === modo);
    if (existente) { existente.cantidad = cant; existente.importe = importe; }
    else carrito.push({ producto: p, modo, cantidad: cant, importe });
    cerrarModal();
    render(main);
    abrirTicketMobile();
  };
```

Reemplazar por:

```javascript
  const aceptar = () => {
    const n = parseFloat(valor || '0') || 0;
    if (n <= 0) { toast('Ingresá una cantidad', 'error'); return; }
    const cant = esMonto ? 0 : n;
    const monto = esMonto ? n : 0;
    const importe = precioPreview(p, modo, cant, monto);
    if (importe <= 0) { toast(`Falta el precio de "${p.nombre}"`, 'error'); return; }
    if (itemExistente) {
      itemExistente.cantidad = cant;
      itemExistente.importe = importe;
    } else {
      const existente = !esMonto && carrito.find((it) => it.producto.id === p.id && it.modo === modo);
      if (existente) { existente.cantidad = cant; existente.importe = importe; }
      else carrito.push({ producto: p, modo, cantidad: cant, importe });
    }
    cerrarModal();
    render(main);
    abrirTicketMobile();
  };
```

- [ ] **Step 4: Reescribir las líneas del ticket con stepper / edición in-line**

Ubicar:

```javascript
// --- Ticket ---
function ticket(main) {
  const total = carrito.reduce((a, it) => a + it.importe, 0);
  const items = carrito.length
    ? carrito.map((it, i) => el('div', { class: 'titem' }, [
        el('div', { class: 'titem-info' }, [
          el('div', { class: 'titem-nombre', text: it.producto.nombre }),
          el('div', { class: 'titem-det', text: detalleItem(it) })
        ]),
        el('div', { class: 'titem-importe', text: money(it.importe) }),
        el('button', { class: 'titem-quitar', text: '×', title: 'Quitar', onClick: () => { carrito.splice(i, 1); render(main); } })
      ]))
    : [el('div', { class: 'ticket-vacio', text: 'Tocá un producto para empezar la venta.' })];
```

Reemplazar por:

```javascript
// --- Ticket ---
function filaTicket(it, i, main) {
  const esEditableConStepper = it.modo === 'unidad' || it.modo === 'docena';
  const cambiarCantidad = (delta) => {
    const nueva = it.cantidad + delta;
    if (nueva <= 0) { carrito.splice(i, 1); render(main); return; }
    it.cantidad = nueva;
    it.importe = precioPreview(it.producto, it.modo, it.cantidad, 0);
    render(main);
  };
  const detalle = esEditableConStepper
    ? el('div', { class: 'titem-stepper' }, [
        el('button', { class: 'btn btn-chico btn-fantasma', text: '−', onClick: () => cambiarCantidad(-1) }),
        el('span', { text: numAR(it.cantidad, 0) + (it.modo === 'docena' ? ' doc' : ' u') }),
        el('button', { class: 'btn btn-chico btn-fantasma', text: '+', onClick: () => cambiarCantidad(1) })
      ])
    : el('div', { class: 'titem-det', style: { cursor: 'pointer', textDecoration: 'underline' }, text: detalleItem(it), onClick: () => pedirCantidad(it.producto, it.modo, main, it) });

  return el('div', { class: 'titem' }, [
    el('div', { class: 'titem-info' }, [
      el('div', { class: 'titem-nombre', text: it.producto.nombre }),
      detalle
    ]),
    el('div', { class: 'titem-importe', text: money(it.importe) }),
    el('button', { class: 'titem-quitar', text: '×', title: 'Quitar', onClick: () => { carrito.splice(i, 1); render(main); } })
  ]);
}

function ticket(main) {
  const total = carrito.reduce((a, it) => a + it.importe, 0);
  const items = carrito.length
    ? carrito.map((it, i) => filaTicket(it, i, main))
    : [el('div', { class: 'ticket-vacio', text: 'Tocá un producto para empezar la venta.' })];
```

- [ ] **Step 5: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En Vender, agregar un producto por unidad al ticket. En la línea del ticket, tocar `+` dos veces: la cantidad y el importe aumentan sin abrir ningún modal. Tocar `−` hasta llegar a 0: la línea se quita sola. Agregar un producto por kilo o por monto libre; en su línea del ticket, tocar el texto de detalle (subrayado): debe reabrirse el teclado numérico con el valor actual precargado en el visor; cambiarlo y "Agregar": la línea se actualiza (no se duplica). El botón "×" sigue quitando la línea completa en cualquier caso. Cobrar una venta con varias líneas mixtas (unidad con stepper editado, kilo editado) y confirmar que el total cobrado coincide con lo mostrado.

```bash
kill %1
```

- [ ] **Step 6: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/vender.js public/styles.css
git commit -m "Agregar edicion in-line del ticket en Vender (stepper y teclado prellenado)"
```

---

### Task 5: Productos — autocompletado de categoría y buscador de texto

**Files:**
- Modify: `public/js/productos.js`

**Interfaces:**
- Consumes: nada nuevo de tasks anteriores.
- Produces: variable de módulo `productosTodos` (reemplaza el parámetro local `productos` de `pintar`), usada como fuente para el filtro de texto y el `<datalist>` de categorías.

- [ ] **Step 1: Convertir `productos` en estado de módulo y agregar `filtroTexto`**

Ubicar en `public/js/productos.js`:

```javascript
let ingredientes = [];
```

Reemplazar por:

```javascript
let ingredientes = [];
let productosTodos = [];
let filtroTexto = '';
```

- [ ] **Step 2: Actualizar `recargar` para guardar `productosTodos`**

Ubicar:

```javascript
async function recargar(cont) {
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  [ingredientes] = await Promise.all([API.get('/api/ingredientes')]);
  const productos = await API.get('/api/productos?todos=1');
  pintar(cont, productos);
}
```

Reemplazar por:

```javascript
async function recargar(cont) {
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  [ingredientes] = await Promise.all([API.get('/api/ingredientes')]);
  productosTodos = await API.get('/api/productos?todos=1');
  pintar(cont);
}
```

- [ ] **Step 3: Separar `pintar` en cabecera (con buscador) + tabla filtrable**

Ubicar:

```javascript
function pintar(cont, productos) {
  const filas = productos.filter((p) => p.activo).map((p) => {
    const margenClase = p.margen_pct == null ? '' : (p.margen_pct < 0 ? 'pos-neg' : 'pos-pos');
    return el('tr', {}, [
      el('td', {}, [el('strong', { text: p.nombre }), el('div', { class: 'titem-det', text: p.categoria + ' · ' + (p.unidad_stock === 'kg' ? 'por kg' : 'por unidad') })]),
      el('td', { class: 'num', text: money(p.costo_unitario) }),
      el('td', { class: 'num', text: p.precio_referencia ? money(p.precio_referencia) : '—' }),
      el('td', { class: 'num ' + margenClase, text: p.margen_pct == null ? '—' : numAR(p.margen_pct, 1) + '%' }),
      el('td', {}, [
        el('button', { class: 'btn btn-chico btn-fantasma', text: 'Editar', onClick: () => abrirForm(cont, p) }),
        p.codigo_barra
          ? el('button', { class: 'btn btn-chico btn-fantasma', text: 'Etiqueta', style: { marginLeft: '8px' }, onClick: () => abrirEtiqueta(p) })
          : el('button', { class: 'btn btn-chico btn-fantasma', text: 'Generar código', style: { marginLeft: '8px' }, onClick: async () => {
              await API.post('/api/productos/' + p.id + '/codigo'); toast('Código generado', 'ok'); recargar(cont);
            } }),
        el('button', { class: 'btn btn-chico btn-rojo', text: 'Quitar', style: { marginLeft: '8px' }, onClick: async () => {
          if (await confirmar(`¿Quitar "${p.nombre}"?`, { textoOk: 'Quitar', peligro: true })) {
            await API.del('/api/productos/' + p.id); toast('Producto quitado', 'ok'); recargar(cont);
          }
        } })
      ])
    ]);
  });

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [
      el('div', {}, [el('h1', { text: 'Productos' }), el('p', { text: 'Precios, formas de venta, receta y costo de cada producto.' })]),
      el('button', { class: 'btn btn-primario', text: '+ Nuevo producto', onClick: () => abrirForm(cont, null) })
    ]),
    el('div', { class: 'panel' }, [
      productos.length
        ? el('div', { class: 'tabla-wrap' }, [el('table', {}, [
            el('thead', {}, [el('tr', {}, [el('th', { text: 'Producto' }), el('th', { class: 'num', text: 'Costo' }), el('th', { class: 'num', text: 'Precio' }), el('th', { class: 'num', text: 'Margen' }), el('th', { text: '' })])]),
            el('tbody', {}, filas)
          ])])
        : el('div', { class: 'vacio', text: 'Todavía no cargaste productos. Tocá “Nuevo producto”.' })
    ])
  ]));
}
```

Reemplazar por:

```javascript
function filasProductos(cont, productos) {
  return productos.map((p) => {
    const margenClase = p.margen_pct == null ? '' : (p.margen_pct < 0 ? 'pos-neg' : 'pos-pos');
    return el('tr', {}, [
      el('td', {}, [el('strong', { text: p.nombre }), el('div', { class: 'titem-det', text: p.categoria + ' · ' + (p.unidad_stock === 'kg' ? 'por kg' : 'por unidad') })]),
      el('td', { class: 'num', text: money(p.costo_unitario) }),
      el('td', { class: 'num', text: p.precio_referencia ? money(p.precio_referencia) : '—' }),
      el('td', { class: 'num ' + margenClase, text: p.margen_pct == null ? '—' : numAR(p.margen_pct, 1) + '%' }),
      el('td', {}, [
        el('button', { class: 'btn btn-chico btn-fantasma', text: 'Editar', onClick: () => abrirForm(cont, p) }),
        p.codigo_barra
          ? el('button', { class: 'btn btn-chico btn-fantasma', text: 'Etiqueta', style: { marginLeft: '8px' }, onClick: () => abrirEtiqueta(p) })
          : el('button', { class: 'btn btn-chico btn-fantasma', text: 'Generar código', style: { marginLeft: '8px' }, onClick: async () => {
              await API.post('/api/productos/' + p.id + '/codigo'); toast('Código generado', 'ok'); recargar(cont);
            } }),
        el('button', { class: 'btn btn-chico btn-rojo', text: 'Quitar', style: { marginLeft: '8px' }, onClick: async () => {
          if (await confirmar(`¿Quitar "${p.nombre}"?`, { textoOk: 'Quitar', peligro: true })) {
            await API.del('/api/productos/' + p.id); toast('Producto quitado', 'ok'); recargar(cont);
          }
        } })
      ])
    ]);
  });
}

function renderTabla(cont, tablaCont) {
  const texto = filtroTexto.trim().toLocaleLowerCase();
  const productos = productosTodos.filter((p) => p.activo && (!texto || p.nombre.toLocaleLowerCase().includes(texto)));
  const filas = filasProductos(cont, productos);
  clear(tablaCont).appendChild(
    productos.length
      ? el('div', { class: 'tabla-wrap' }, [el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Producto' }), el('th', { class: 'num', text: 'Costo' }), el('th', { class: 'num', text: 'Precio' }), el('th', { class: 'num', text: 'Margen' }), el('th', { text: '' })])]),
          el('tbody', {}, filas)
        ])])
      : el('div', { class: 'vacio', text: filtroTexto ? 'Ningún producto coincide con la búsqueda.' : 'Todavía no cargaste productos. Tocá “Nuevo producto”.' })
  );
}

function pintar(cont) {
  const tablaCont = el('div', { class: 'panel' });
  const buscador = input({ value: filtroTexto, placeholder: 'Buscar producto…' });
  buscador.addEventListener('input', () => { filtroTexto = buscador.value; renderTabla(cont, tablaCont); });

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [
      el('div', {}, [el('h1', { text: 'Productos' }), el('p', { text: 'Precios, formas de venta, receta y costo de cada producto.' })]),
      el('button', { class: 'btn btn-primario', text: '+ Nuevo producto', onClick: () => abrirForm(cont, null) })
    ]),
    el('div', { class: 'panel' }, [buscador]),
    tablaCont
  ]));
  renderTabla(cont, tablaCont);
}
```

- [ ] **Step 4: Agregar el `<datalist>` de categorías al formulario**

Ubicar:

```javascript
function abrirForm(cont, p, codigoPrellenado) {
  const esNuevo = !p;
  p = p || { nombre: '', categoria: 'General', unidad_stock: 'unidad', tipo: 'elaborado', codigo_barra: codigoPrellenado || '',
    minutos_mano_obra: 0, precio_unidad: 0, precio_docena: 0, precio_kg: 0, vende_unidad: 1, vende_docena: 0, vende_kg: 0, vende_monto: 1 };

  const inNombre = input({ value: p.nombre, placeholder: 'Ej: Ravioles de ricota' });
  const inCat = input({ value: p.categoria, placeholder: 'Ej: Rellenas' });
```

Reemplazar por:

```javascript
function abrirForm(cont, p, codigoPrellenado) {
  const esNuevo = !p;
  p = p || { nombre: '', categoria: 'General', unidad_stock: 'unidad', tipo: 'elaborado', codigo_barra: codigoPrellenado || '',
    minutos_mano_obra: 0, precio_unidad: 0, precio_docena: 0, precio_kg: 0, vende_unidad: 1, vende_docena: 0, vende_kg: 0, vende_monto: 1 };

  const inNombre = input({ value: p.nombre, placeholder: 'Ej: Ravioles de ricota' });
  const categoriasExistentes = [...new Set(productosTodos.map((x) => x.categoria).filter(Boolean))];
  const datalistCat = el('datalist', { id: 'categorias-existentes' }, categoriasExistentes.map((c) => el('option', { value: c })));
  const inCat = input({ value: p.categoria, placeholder: 'Ej: Rellenas', list: 'categorias-existentes' });
```

Ubicar:

```javascript
  const form = el('div', {}, [
    campo('Nombre', inNombre),
    el('div', { class: 'campos-2' }, [campo('Categoría', inCat), campo('Se vende', inUnidad)]),
```

Reemplazar por:

```javascript
  const form = el('div', {}, [
    datalistCat,
    campo('Nombre', inNombre),
    el('div', { class: 'campos-2' }, [campo('Categoría', inCat), campo('Se vende', inUnidad)]),
```

- [ ] **Step 5: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En Productos, escribir en el buscador el nombre (o parte del nombre) de un producto existente: la tabla se filtra en vivo sin parpadeos, y el cursor del buscador no pierde el foco entre letra y letra. Borrar el texto: vuelve a mostrar todos. Abrir "+ Nuevo producto" o "Editar" un producto existente y tocar el campo Categoría: el navegador debe sugerir las categorías ya usadas (por ejemplo "Rellenas", "Secas"); se puede igual escribir una categoría nueva. Guardar un producto y confirmar que sigue funcionando igual que antes.

```bash
kill %1
```

- [ ] **Step 6: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/productos.js
git commit -m "Agregar buscador de texto y autocompletado de categoria en Productos"
```

---

### Task 6: Caja — colores consistentes en el desglose de efectivo

**Files:**
- Modify: `public/js/caja.js`

**Interfaces:**
- Consumes: clases `pos-neg`/`pos-pos` ya definidas en `styles.css` (usadas hoy en Stock/Productos/Reportes).

- [ ] **Step 1: Agregar clase de signo a `fila` y `filaFuerte`**

Ubicar en `public/js/caja.js`:

```javascript
function fila(a, b, c) {
  return el('tr', {}, [el('td', {}, [a, c ? el('span', { class: 'titem-det', text: '  ' + c }) : null]), el('td', { class: 'num', text: b })]);
}
function filaFuerte(a, b) {
  return el('tr', {}, [el('td', {}, [el('strong', { text: a })]), el('td', { class: 'num' }, [el('strong', { text: b })])]);
}
```

Reemplazar por:

```javascript
function fila(a, b, c, clase = '') {
  return el('tr', {}, [el('td', {}, [a, c ? el('span', { class: 'titem-det', text: '  ' + c }) : null]), el('td', { class: 'num ' + clase, text: b })]);
}
function filaFuerte(a, b, clase = '') {
  return el('tr', {}, [el('td', {}, [el('strong', { text: a })]), el('td', { class: 'num ' + clase }, [el('strong', { text: b })])]);
}
```

- [ ] **Step 2: Usar la clase de signo en el desglose**

Ubicar:

```javascript
    const desglose = el('div', { class: 'panel' }, [
      el('h2', { text: '¿De dónde viene la plata?' }),
      el('div', { class: 'tabla-wrap' }, [el('table', {}, [
        el('tbody', {}, [
          ...caja.ventas_por_medio.map((m) => fila(MEDIO_LABEL[m.medio_pago] || m.medio_pago, money(m.total), `${m.cant} ventas`)),
          fila('Gastos pagados en efectivo', '− ' + money(caja.gastos_efectivo)),
          fila('Compras pagadas en efectivo', '− ' + money(caja.compras_efectivo)),
          fila('Saldo inicial de caja', money(caja.saldo_inicial)),
          filaFuerte('Efectivo que deberías tener', money(caja.caja_esperada))
        ])
      ])])
    ]);
```

Reemplazar por:

```javascript
    const desglose = el('div', { class: 'panel' }, [
      el('h2', { text: '¿De dónde viene la plata?' }),
      el('div', { class: 'tabla-wrap' }, [el('table', {}, [
        el('tbody', {}, [
          ...caja.ventas_por_medio.map((m) => fila(MEDIO_LABEL[m.medio_pago] || m.medio_pago, money(m.total), `${m.cant} ventas`)),
          fila('Gastos pagados en efectivo', '− ' + money(caja.gastos_efectivo), null, 'pos-neg'),
          fila('Compras pagadas en efectivo', '− ' + money(caja.compras_efectivo), null, 'pos-neg'),
          fila('Saldo inicial de caja', money(caja.saldo_inicial)),
          filaFuerte('Efectivo que deberías tener', money(caja.caja_esperada), caja.caja_esperada < 0 ? 'pos-neg' : 'pos-pos')
        ])
      ])])
    ]);
```

- [ ] **Step 3: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En Caja, con un período que tenga gastos o compras pagados en efectivo cargados, confirmar que esas dos filas se ven en rojo (mismo tono que el resto del sistema). Confirmar que "Efectivo que deberías tener" se ve en rojo si el valor es negativo y en verde si es positivo, igual que el KPI de arriba.

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/caja.js
git commit -m "Usar colores pos/neg consistentes en el desglose de caja"
```

---

### Task 7: Stock — vista previa de minutos en "Registrar producción"

**Files:**
- Modify: `public/js/stock.js`

**Interfaces:**
- Consumes: `producto.minutos_mano_obra` (ya viene en cada objeto de `productos`, cargado en `recargar`).

- [ ] **Step 1: Agregar el cálculo y el texto en vivo**

Ubicar en `public/js/stock.js`:

```javascript
function formProduccion(cont) {
  if (!productos.length) { toast('Primero cargá un producto', 'error'); return; }
  const inProd = select(productos.map((p) => ({ value: p.id, label: p.nombre })), productos[0].id);
  const inCant = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
  const inEmp = input({ placeholder: 'Ej: Carlos' });
  const inMin = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'automático según receta' });
  const uniLabel = el('span', { class: 'ayuda' });
  const refUni = () => { const p = productos.find((x) => String(x.id) === String(inProd.value)); uniLabel.textContent = p ? (p.unidad_stock === 'kg' ? 'kilos' : 'unidades') : ''; };
  inProd.addEventListener('change', refUni); refUni();

  const form = el('div', {}, [
    campo('Producto', inProd),
    campo('Cantidad producida', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [inCant, uniLabel])),
    el('div', { class: 'campos-2' }, [
      campo('Empleado', inEmp, 'opcional'),
      campo('Minutos de trabajo', inMin, 'dejalo vacío para usar la receta')
    ])
  ]);
```

Reemplazar por:

```javascript
function formProduccion(cont) {
  if (!productos.length) { toast('Primero cargá un producto', 'error'); return; }
  const inProd = select(productos.map((p) => ({ value: p.id, label: p.nombre })), productos[0].id);
  const inCant = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
  const inEmp = input({ placeholder: 'Ej: Carlos' });
  const inMin = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'automático según receta' });
  const uniLabel = el('span', { class: 'ayuda' });
  const estimadoMin = el('span', { class: 'ayuda' });
  const refEstimado = () => {
    if (inMin.value !== '') { estimadoMin.textContent = ''; return; }
    const p = productos.find((x) => String(x.id) === String(inProd.value));
    const cant = parseFloat(inCant.value) || 0;
    if (!p || cant <= 0) { estimadoMin.textContent = '  dejalo vacío para usar la receta'; return; }
    estimadoMin.textContent = `  dejalo vacío para usar ${numAR((p.minutos_mano_obra || 0) * cant, 0)} min (según receta)`;
  };
  const refUni = () => {
    const p = productos.find((x) => String(x.id) === String(inProd.value));
    uniLabel.textContent = p ? (p.unidad_stock === 'kg' ? 'kilos' : 'unidades') : '';
    refEstimado();
  };
  inProd.addEventListener('change', refUni);
  inCant.addEventListener('input', refEstimado);
  inMin.addEventListener('input', refEstimado);
  refUni();

  const campoMin = el('div', { class: 'campo' }, [
    el('label', {}, ['Minutos de trabajo', estimadoMin]),
    inMin
  ]);

  const form = el('div', {}, [
    campo('Producto', inProd),
    campo('Cantidad producida', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [inCant, uniLabel])),
    el('div', { class: 'campos-2' }, [
      campo('Empleado', inEmp, 'opcional'),
      campoMin
    ])
  ]);
```

- [ ] **Step 2: Verificar en el navegador**

```bash
cd /home/claudeuras
npm start &
sleep 1
```

En Stock → "Registrar producción", elegir un producto que tenga minutos de mano de obra configurados (ver/editar en Productos si hace falta) y cargar una cantidad: debajo de "Minutos de trabajo" debe aparecer en vivo "dejalo vacío para usar N min (según receta)" con el cálculo correcto (`minutos_mano_obra × cantidad`). Escribir un valor manual en el campo Minutos: el texto de ayuda desaparece. Borrar ese valor manual: el texto reaparece con el cálculo.

```bash
kill %1
```

- [ ] **Step 3: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/stock.js
git commit -m "Mostrar vista previa de minutos estimados en Registrar produccion"
```

---

### Task 8: Costos — aviso del costo indirecto colapsable

**Files:**
- Modify: `public/js/reportes.js`

**Interfaces:**
- Produces: usa `localStorage` (clave `costos_aviso_oculto`), sin cambios de API.

- [ ] **Step 1: Agregar `avisoCostos` y usarlo en `pintar`**

Ubicar en `public/js/reportes.js`:

```javascript
function pintar(cont, data) {
  const filas = data.productos.map((p) => {
```

Reemplazar por:

```javascript
const AVISO_KEY = 'costos_aviso_oculto';

function avisoCostos(data) {
  if (localStorage.getItem(AVISO_KEY) === '1') return null;
  const cerrar = (e) => { e.currentTarget.closest('.aviso').remove(); localStorage.setItem(AVISO_KEY, '1'); };
  return el('div', { class: 'aviso', style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' } }, [
    el('span', { text: `Costo indirecto del mes: ${money(data.overhead_por_minuto)} por minuto de trabajo. Valor de la hora: ${money(data.costo_hora)}. Con poca producción cargada, el costo indirecto se ve alto y se acomoda durante el mes.` }),
    el('button', { class: 'btn btn-chico btn-fantasma', text: '×', title: 'No volver a mostrar', onClick: cerrar })
  ]);
}

function pintar(cont, data) {
  const filas = data.productos.map((p) => {
```

Ubicar:

```javascript
  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Costos' }), el('p', { text: 'Cuánto cuesta hacer cada producto y cuánto te deja.' })])]),
    el('div', { class: 'aviso', text: `Costo indirecto del mes: ${money(data.overhead_por_minuto)} por minuto de trabajo. Valor de la hora: ${money(data.costo_hora)}. Con poca producción cargada, el costo indirecto se ve alto y se acomoda durante el mes.` }),
    el('div', { class: 'panel' }, [
```

Reemplazar por:

```javascript
  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Costos' }), el('p', { text: 'Cuánto cuesta hacer cada producto y cuánto te deja.' })])]),
    avisoCostos(data),
    el('div', { class: 'panel' }, [
```

- [ ] **Step 2: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En Costos, el aviso debe verse igual que antes (mismo texto). Tocar la "×": el aviso desaparece. Recargar la página (F5) y volver a Costos: el aviso no debe reaparecer. En la consola del navegador, ejecutar `localStorage.removeItem('costos_aviso_oculto')` y recargar: el aviso vuelve a aparecer.

```bash
kill %1
```

- [ ] **Step 3: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/reportes.js
git commit -m "Hacer colapsable el aviso de costo indirecto en Costos"
```

---

### Task 9: Cross-cutting — scroll persistente y color de categoría en el chip

**Files:**
- Modify: `public/js/stock.js`, `public/js/productos.js`, `public/js/caja.js`, `public/js/vender.js`

**Interfaces:**
- Consumes: `conScroll` de Task 2.

- [ ] **Step 1: Importar y usar `conScroll` en Stock**

Ubicar en `public/js/stock.js`:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar } from './ui.js';
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar, conScroll } from './ui.js';
```

Ubicar (en `formIngrediente`, dos apariciones — la de guardar y la de quitar):

```javascript
      cerrarModal(); toast('Ingrediente guardado', 'ok'); recargar(cont);
```

Reemplazar por:

```javascript
      cerrarModal(); toast('Ingrediente guardado', 'ok'); conScroll(() => recargar(cont));
```

Ubicar:

```javascript
        if (await confirmar(`¿Quitar "${ing.nombre}"?`, { textoOk: 'Quitar', peligro: true })) { await API.del('/api/ingredientes/' + ing.id); cerrarModal(); toast('Ingrediente quitado', 'ok'); recargar(cont); }
```

Reemplazar por:

```javascript
        if (await confirmar(`¿Quitar "${ing.nombre}"?`, { textoOk: 'Quitar', peligro: true })) { await API.del('/api/ingredientes/' + ing.id); cerrarModal(); toast('Ingrediente quitado', 'ok'); conScroll(() => recargar(cont)); }
```

Ubicar (en `formCompra`):

```javascript
      cerrarModal(); toast(`Compra cargada. Nuevo costo: ${money(r.costo_unidad_base)}`, 'ok'); recargar(cont);
```

Reemplazar por:

```javascript
      cerrarModal(); toast(`Compra cargada. Nuevo costo: ${money(r.costo_unidad_base)}`, 'ok'); conScroll(() => recargar(cont));
```

Ubicar (en `formProduccion`, al final de `guardar`):

```javascript
      recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({ title: 'Registrar producción', body: form, actions: [
```

Reemplazar por:

```javascript
      conScroll(() => recargar(cont));
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({ title: 'Registrar producción', body: form, actions: [
```

- [ ] **Step 2: Importar y usar `conScroll` en Productos**

Ubicar en `public/js/productos.js`:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar, cantLegible } from './ui.js';
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar, cantLegible, conScroll } from './ui.js';
```

Ubicar (dentro de `filasProductos`, dos apariciones — generar código y quitar):

```javascript
              await API.post('/api/productos/' + p.id + '/codigo'); toast('Código generado', 'ok'); recargar(cont);
```

Reemplazar por:

```javascript
              await API.post('/api/productos/' + p.id + '/codigo'); toast('Código generado', 'ok'); conScroll(() => recargar(cont));
```

Ubicar:

```javascript
            await API.del('/api/productos/' + p.id); toast('Producto quitado', 'ok'); recargar(cont);
```

Reemplazar por:

```javascript
            await API.del('/api/productos/' + p.id); toast('Producto quitado', 'ok'); conScroll(() => recargar(cont));
```

Ubicar (en `abrirForm.guardar`):

```javascript
      cerrarModal(); toast('Producto guardado', 'ok'); recargar(cont);
```

Reemplazar por:

```javascript
      cerrarModal(); toast('Producto guardado', 'ok'); conScroll(() => recargar(cont));
```

Ubicar (en `abrirActualizacionRapida.guardar`):

```javascript
    cerrarModal();
    recargar(cont);
    if (!huboError) toast(`"${p.nombre}" actualizado`, 'ok');
```

Reemplazar por:

```javascript
    cerrarModal();
    conScroll(() => recargar(cont));
    if (!huboError) toast(`"${p.nombre}" actualizado`, 'ok');
```

- [ ] **Step 3: Importar y usar `conScroll` en Caja (recarga tras anular una venta)**

Ubicar en `public/js/caja.js`:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, confirmar, toast } from './ui.js';
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, confirmar, toast, conScroll } from './ui.js';
```

Ubicar:

```javascript
        if (await confirmar('¿Anular esta venta? Se repone el stock.', { textoOk: 'Anular', peligro: true })) {
          try { await API.del('/api/ventas/' + v.id); toast('Venta anulada', 'ok'); recargar(); }
          catch (e) { toast(e.message, 'error'); }
        }
```

Reemplazar por:

```javascript
        if (await confirmar('¿Anular esta venta? Se repone el stock.', { textoOk: 'Anular', peligro: true })) {
          try { await API.del('/api/ventas/' + v.id); toast('Venta anulada', 'ok'); conScroll(recargar); }
          catch (e) { toast(e.message, 'error'); }
        }
```

- [ ] **Step 4: Buscador de texto y color de categoría en el chip de Vender**

La auditoría original pedía buscador de texto en Vender **y** en Productos (Task 5 ya lo agregó en Productos); acá se agrega el de Vender junto con el acento de color en los chips, ya que ambos tocan la misma función `render()`.

Ubicar en `public/js/vender.js`:

```javascript
import API from './api.js';
import { el, clear, money, numAR, modal, cerrarModal, toast, colorCategoria } from './ui.js';
import { activarEscaner } from './scanner.js';

let productos = [];
let categoriaActiva = 'Todos';
let carrito = [];
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, modal, cerrarModal, toast, colorCategoria } from './ui.js';
import { activarEscaner } from './scanner.js';

let productos = [];
let categoriaActiva = 'Todos';
let carrito = [];
let filtroTextoVender = '';
```

Ubicar:

```javascript
function render(main) {
  const cats = ['Todos', ...new Set(productos.map((p) => p.categoria))];
  const chips = el('div', { class: 'chips' }, cats.map((c) =>
    el('button', {
      class: 'chip' + (c === categoriaActiva ? ' activo' : ''),
      text: c, onClick: () => { categoriaActiva = c; render(main); }
    })
  ));

  const lista = productos.filter((p) => categoriaActiva === 'Todos' || p.categoria === categoriaActiva);
  const fichas = el('div', { class: 'fichas' }, lista.map((p) => ficha(p, main)));

  const cuerpo = el('div', {}, [
    chips,
    lista.length ? fichas : el('div', { class: 'vacio' }, ['No hay productos en esta categoría. Cargalos en la pantalla Productos.'])
  ]);
```

Reemplazar por:

```javascript
function render(main) {
  const cats = ['Todos', ...new Set(productos.map((p) => p.categoria))];
  const chips = el('div', { class: 'chips' }, cats.map((c) =>
    el('button', {
      class: 'chip' + (c === categoriaActiva ? ' activo' : ''),
      style: c === 'Todos' ? {} : { borderTopColor: colorCategoria(c) },
      text: c, onClick: () => { categoriaActiva = c; render(main); }
    })
  ));

  const buscador = input({ value: filtroTextoVender, placeholder: 'Buscar producto…', style: { marginBottom: '14px' } });
  buscador.classList.add('buscador-vender');
  buscador.addEventListener('input', () => {
    filtroTextoVender = buscador.value;
    const cursor = buscador.selectionStart;
    render(main);
    const nuevo = main.querySelector('.buscador-vender');
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(cursor, cursor); }
  });

  const texto = filtroTextoVender.trim().toLocaleLowerCase();
  const lista = productos.filter((p) =>
    (categoriaActiva === 'Todos' || p.categoria === categoriaActiva) &&
    (!texto || p.nombre.toLocaleLowerCase().includes(texto))
  );
  const fichas = el('div', { class: 'fichas' }, lista.map((p) => ficha(p, main)));

  const cuerpo = el('div', {}, [
    buscador,
    chips,
    lista.length ? fichas : el('div', { class: 'vacio' }, ['No hay productos que coincidan. Probá otra categoría o búsqueda.'])
  ]);
```

- [ ] **Step 5: Verificar en el navegador**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start &
sleep 1
```

En Stock, con varios ingredientes cargados (scrollear la lista hacia abajo si hace falta agregar varios de prueba), editar el último ingrediente de la tabla y guardar: la página no debe saltar al principio, se queda donde estaba. Repetir en Productos (editar/generar código de un producto que esté abajo de la lista) y en Caja (anular una venta que esté al final de "Ventas del período" con varias cargadas). En Vender, confirmar que cada chip de categoría (menos "Todos") muestra un borde superior del mismo color que la franja de las fichas de esa categoría, y que escribir en el nuevo buscador de arriba de la grilla filtra las fichas en vivo por nombre **sin perder el foco ni el cursor** entre letra y letra (escribir una palabra completa de corrido es la prueba real).

```bash
kill %1
```

- [ ] **Step 6: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/stock.js public/js/productos.js public/js/caja.js public/js/vender.js
git commit -m "Preservar scroll al recargar listas y reflejar color de categoria en el chip"
```

---

### Task 10: Verificación end-to-end y decisión de merge

**Files:**
- Ninguno (solo verificación).

**Interfaces:**
- Consumes: todo lo construido en las Tasks 1 a 9, corriendo junto como un sistema.

- [ ] **Step 1: Levantar el servidor localmente**

```bash
cd /home/claudeuser/work/fabrica-pastas
npm start
```

- [ ] **Step 2: Recorrido completo por las 7 pantallas**

- **Vender:** agregado rápido por tap + contador, botón "⋯", ticket con stepper y edición de kg/monto, cobro de una venta mixta, escaneo de código (de la Task de código de barras, no debe haberse roto), búsqueda visual del color de categoría en los chips.
- **Caja:** colores del desglose, anular una venta sin perder el scroll.
- **Stock:** vista previa de minutos en producción, guardar un ingrediente/compra/producción sin perder el scroll.
- **Productos:** buscador de texto, autocompletado de categoría, guardar sin perder el scroll.
- **Gastos, Ajustes:** confirmar que siguen funcionando igual (no se tocaron, pero las confirmaciones ahora se ven como modal chico).
- **Costos:** aviso colapsable.
- Recorrido de foco por teclado (Tab) en al menos dos pantallas: confirmar que se ve un anillo de foco en botones/chips/fichas al navegar sin mouse, y que no aparece al tocar/clickear normalmente.

- [ ] **Step 3: Confirmar que nada se rompió fuera del alcance**

- Login/logout, cambio de usuario, cálculo de costos y márgenes en Costos y Productos: deben dar los mismos números que antes de este trabajo (no se tocó ninguna lógica de cálculo).
- Revisar la consola del navegador en cada pantalla: no debe haber errores nuevos.

- [ ] **Step 4: Esperar la aprobación del usuario antes de mergear**

No hacer `git checkout master`, `git merge`, ni reiniciar pm2 todavía. El usuario dijo que va a probar él mismo en la web — avisarle que la rama `mejoras-ux-2026-07` está lista para probar (indicarle que puede levantar `npm start` local o pedir que se le arme una instancia temporal si prefiere probarlo así) y esperar su confirmación explícita antes de continuar.

- [ ] **Step 5: Mergear a `master` y desplegar (recién cuando el usuario confirme)**

```bash
cd /home/claudeuser/work/fabrica-pastas
git checkout master
git merge mejoras-ux-2026-07
pm2 restart fabrica
pm2 logs fabrica --lines 30
```

Confirmar en los logs que arrancó sin errores, y verificar una vez más en `https://elsastredelapasta.com` (o la URL que corresponda) que Vender, Caja, Stock, Productos y Costos se comportan igual que en la verificación local antes de dar por cerrado el trabajo.
