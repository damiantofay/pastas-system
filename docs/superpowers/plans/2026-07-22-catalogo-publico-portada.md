# Catálogo público y CTA de WhatsApp en la portada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a la portada pública (`elsastredelapasta.com`) un catálogo de productos con precios (filtrable por categoría) y un botón de pedido por WhatsApp, sin exponer datos internos (costos, márgenes, stock exacto) y sin requerir login.

**Architecture:** Un endpoint nuevo y público `GET /api/publico/productos` en `server.js`, montado antes del middleware `requireAuth`, expone solo `nombre`, `categoria`, `precioTexto` y `disponible` por producto activo. Un módulo frontend nuevo `public/js/portada.js` lo consume y renderiza chips de categoría + tarjetas de producto dentro de `public/index.html`, reutilizando los helpers y clases CSS ya existentes (`el`, `clear`, `colorCategoria` de `ui.js`; `.chips`/`.chip`/`.fichas`/`.ficha`/`.vacio`/`.btn` de `styles.css`) sin agregar CSS nuevo.

**Tech Stack:** Node.js + Express + better-sqlite3 (backend, sin dependencias nuevas). HTML/CSS/JS vanilla con módulos ES nativos del navegador (frontend, sin build step, sin dependencias nuevas).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-22-catalogo-publico-portada-design.md` — leer antes de implementar, ya resuelve todas las decisiones de diseño.
- Sin framework de tests automatizados en el proyecto: toda verificación es manual (`curl` para el backend, navegador para el frontend), igual que en los planes anteriores del repo.
- El servidor sirve los archivos directamente sin build step: cualquier cambio guardado en disco toma efecto en la próxima request (o recargando la página), sin reiniciar pm2, salvo cambios en `server.js` que sí requieren reinicio del proceso (ver Task 1).
- **No tocar `public/js/vender.js`** ni ningún otro archivo fuera del alcance de este plan: hay cambios sin commitear ahí (trabajo en curso de otro plan, "agregado rápido"), ya sirviendo en producción. No se debe pisar ni commitear ese trabajo.
- Al commitear, agregar **siempre archivos por nombre explícito** (`git add server.js public/js/portada.js public/index.html`), nunca `git add -A` ni `git add .` — para no arrastrar el trabajo en curso de `vender.js`.
- No exponer en el endpoint público: `id`, `costo_compra`, `minutos_mano_obra`, `receta`, `codigo_barra`, ni el `stock` numérico exacto — solo `nombre`, `categoria`, `precioTexto`, `disponible` (booleano).
- No agregar fotos de producto, WhatsApp por producto individual, ni carrito/checkout en la portada — fuera de alcance según el spec.
- Rama de trabajo: `mejoras-ux-2026-07` (la que ya está activa en el repo). No mergear a `master` ni tocar la copia servida en producción hasta que el usuario confirme explícitamente tras probar en el navegador.

---

### Task 1: Endpoint público `GET /api/publico/productos`

**Files:**
- Modify: `server.js:26-27` (agregar helpers), `server.js:42-43` (agregar la ruta)
- Test: manual, con `curl`

**Interfaces:**
- Produces (usado por Task 2): `GET /api/publico/productos` → `200 application/json`, array de `{ nombre: string, categoria: string, precioTexto: string|null, disponible: boolean }`. Sin autenticación requerida.

- [ ] **Step 1: Agregar los helpers de formateo de precio**

Ubicar en `server.js`:

```javascript
const bool01 = (v) => (v ? 1 : 0);
const lastId = (r) => Number(r.lastInsertRowid);
```

Reemplazar por:

```javascript
const bool01 = (v) => (v ? 1 : 0);
const lastId = (r) => Number(r.lastInsertRowid);

// Formato de dinero para respuestas públicas (mismo formato que public/js/ui.js money())
function moneyServer(n) {
  const v = Number(n) || 0;
  return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Misma prioridad de precio que usa la ficha de producto en Vender (public/js/vender.js ficha()):
// unidad > kg > docena. Devuelve null si el producto no tiene ningún precio cargado en esos modos.
function precioTextoDe(p) {
  if (p.vende_unidad && p.precio_unidad) return moneyServer(p.precio_unidad) + ' c/u';
  if (p.vende_kg && p.precio_kg) return moneyServer(p.precio_kg) + ' /kg';
  if (p.vende_docena && p.precio_docena) return moneyServer(p.precio_docena) + ' /doc';
  return null;
}
```

- [ ] **Step 2: Agregar la ruta pública, antes del guardia de autenticación**

Ubicar en `server.js`:

```javascript
const auth = require('./auth');
const { requireAuth, requireAdmin } = auth.montar(app); // registra /api/login, /api/logout, /api/me
app.use('/api', requireAuth); // de acá para abajo, todo /api pide sesión
```

Reemplazar por:

```javascript
const auth = require('./auth');
const { requireAuth, requireAdmin } = auth.montar(app); // registra /api/login, /api/logout, /api/me

// Catálogo público para la portada institucional (elsastredelapasta.com) — sin login,
// expone solo lo necesario para mostrar precios en el sitio público. Nunca costos, ids,
// receta ni stock exacto (ver docs/superpowers/specs/2026-07-22-catalogo-publico-portada-design.md).
app.get('/api/publico/productos', h((req, res) => {
  const rows = db.prepare(
    `SELECT nombre, categoria, stock, precio_unidad, precio_docena, precio_kg, vende_unidad, vende_docena, vende_kg
     FROM producto WHERE sucursal_id = 1 AND activo = 1 ORDER BY categoria, nombre`
  ).all();
  res.json(rows.map((p) => ({
    nombre: p.nombre,
    categoria: p.categoria,
    precioTexto: precioTextoDe(p),
    disponible: p.stock > 0
  })));
}));

app.use('/api', requireAuth); // de acá para abajo, todo /api pide sesión
```

- [ ] **Step 3: Reiniciar el proceso pm2 para tomar el cambio de `server.js`**

```bash
pm2 restart fabrica
```

Expected: pm2 muestra el proceso `fabrica` en estado `online` con uptime reiniciado.

- [ ] **Step 4: Verificar que la ruta responde sin sesión y con los campos correctos**

```bash
curl -s http://localhost:3000/api/publico/productos | head -c 500
```

Expected: `200 OK` con JSON — un array de objetos con **exactamente** las claves `nombre`, `categoria`, `precioTexto`, `disponible`. Ningún objeto debe tener `id`, `costo`, `stock`, `receta` ni `codigo_barra`. Si la base tiene productos cargados, la respuesta no debe estar vacía.

Confirmar también que sigue pidiendo sesión donde corresponde (no se rompió el resto de la API):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/productos
```

Expected: `401` (la ruta autenticada existente sigue exigiendo login).

- [ ] **Step 5: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add server.js
git commit -m "$(cat <<'EOF'
Agregar endpoint público /api/publico/productos para el catálogo de la portada

Expone nombre, categoría, precio formateado y disponibilidad de cada
producto activo sin requerir login, para que la portada pública pueda
mostrar el catálogo sin filtrar costos, ids ni stock exacto.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Módulo frontend `public/js/portada.js`

**Files:**
- Create: `public/js/portada.js`
- Test: manual, con `curl` (estructura del bundle) y en el navegador (Task 4 hace la verificación visual final una vez que `index.html` lo referencia)

**Interfaces:**
- Consumes: `GET /api/publico/productos` (Task 1) → array de `{ nombre, categoria, precioTexto, disponible }`.
- Consumes de `public/js/ui.js`: `el(tag, attrs, children)`, `clear(node)`, `colorCategoria(categoria)` — funciones ya existentes, sin cambios.
- Produces (usado por Task 3): al importarse como `<script type="module" src="/js/portada.js">`, busca en el DOM un elemento `<div id="catalogo"></div>` y lo llena. No exporta nada (se autoejecuta).

- [ ] **Step 1: Crear el archivo**

```javascript
import { el, clear, colorCategoria } from './ui.js';

let productos = [];
let categoriaActiva = 'Todos';

async function cargar() {
  const cont = document.getElementById('catalogo');
  try {
    const res = await fetch('/api/publico/productos');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    productos = await res.json();
    render();
  } catch (e) {
    clear(cont).appendChild(
      el('div', { class: 'vacio' }, ['No se pudo cargar el catálogo. Escribinos por WhatsApp.'])
    );
  }
}

function render() {
  const cont = document.getElementById('catalogo');
  const cats = ['Todos', ...new Set(productos.map((p) => p.categoria))];
  const chips = el('div', { class: 'chips' }, cats.map((c) =>
    el('button', {
      class: 'chip' + (c === categoriaActiva ? ' activo' : ''),
      text: c,
      onClick: () => { categoriaActiva = c; render(); }
    })
  ));

  const lista = productos.filter((p) => categoriaActiva === 'Todos' || p.categoria === categoriaActiva);
  const fichas = el('div', { class: 'fichas' }, lista.map((p) => ficha(p)));

  clear(cont).appendChild(el('div', {}, [
    chips,
    lista.length ? fichas : el('div', { class: 'vacio' }, ['No hay productos en esta categoría.'])
  ]));
}

function ficha(p) {
  return el('div', { class: 'ficha' }, [
    el('span', { class: 'ficha-cat', style: { background: colorCategoria(p.categoria) } }),
    el('div', { class: 'ficha-nombre', text: p.nombre }),
    el('div', {}, [
      el('div', { class: 'ficha-precio', text: p.precioTexto || 'Sin precio' }),
      p.disponible ? null : el('div', { class: 'ficha-stock bajo', text: 'Sin stock' })
    ])
  ]);
}

cargar();
```

- [ ] **Step 2: Verificar que el archivo se sirve como módulo JS válido**

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/js/portada.js
```

Expected: `200` con `content_type` que incluya `javascript` (Express sirve `.js` con ese tipo por defecto vía `express.static`).

- [ ] **Step 3: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/js/portada.js
git commit -m "$(cat <<'EOF'
Agregar módulo portada.js: catálogo público filtrable por categoría

Consume /api/publico/productos y renderiza chips de categoría + tarjetas
de producto reutilizando los helpers y clases ya existentes de ui.js y
styles.css (mismo patrón visual que la pantalla Vender interna).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Integrar el catálogo y el CTA de WhatsApp en `public/index.html`

**Files:**
- Modify: `public/index.html`
- Test: manual, con `curl` + revisión visual en navegador

**Interfaces:**
- Consumes: `public/js/portada.js` (Task 2) vía `<script type="module">`; espera encontrar `<div id="catalogo"></div>` en el DOM.

- [ ] **Step 1: Agregar estilos puntuales para el CTA y el título del catálogo**

Ubicar en `public/index.html`:

```html
  .portada .ingreso{ margin-top:34px; }
  .portada .ingreso a{ color:var(--tinta-suave); font-weight:600; font-size:.95rem; text-decoration:underline; }
</style>
```

Reemplazar por:

```html
  .portada .ingreso{ margin-top:34px; }
  .portada .ingreso a{ color:var(--tinta-suave); font-weight:600; font-size:.95rem; text-decoration:underline; }
  .portada .cta-pedido{ margin:28px 0; }
  .portada .catalogo-titulo{ text-align:left; margin:36px 0 14px; }
</style>
```

- [ ] **Step 2: Agregar el botón de WhatsApp y el contenedor del catálogo**

Ubicar en `public/index.html`:

```html
    <div class="ingreso">
      <a href="/login.html">Ingresar (administradores y empleados)</a>
    </div>
  </div>
</body>
</html>
```

Reemplazar por:

```html
    <div class="cta-pedido">
      <a class="btn btn-verde btn-grande btn-bloque"
         href="https://wa.me/5493444525595?text=Hola!%20Quiero%20hacer%20un%20pedido"
         target="_blank" rel="noopener">🍝 Hacé tu pedido por WhatsApp</a>
    </div>

    <h2 class="catalogo-titulo">Nuestros productos</h2>
    <div id="catalogo"></div>

    <div class="ingreso">
      <a href="/login.html">Ingresar (administradores y empleados)</a>
    </div>
  </div>
  <script type="module" src="/js/portada.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verificar la estructura servida**

```bash
curl -s http://localhost:3000/ | grep -E 'id="catalogo"|cta-pedido|portada.js'
```

Expected: las tres líneas aparecen en la salida (el contenedor del catálogo, el bloque del CTA, y el `<script>` de `portada.js`).

- [ ] **Step 4: Commit**

```bash
cd /home/claudeuser/work/fabrica-pastas
git add public/index.html
git commit -m "$(cat <<'EOF'
Agregar botón de WhatsApp y catálogo público a la portada institucional

La portada ahora, además de la info institucional, muestra un botón
destacado para pedir por WhatsApp y el catálogo de productos con precios
(public/js/portada.js), completando lo que había quedado pendiente del
spec original de portada (2026-07-05).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verificación end-to-end en el navegador

**Files:**
- Ninguno (solo verificación)

**Interfaces:**
- Ninguna — task de validación manual, cierre del plan.

- [ ] **Step 1: Verificar el flujo completo por HTTP con `curl`**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" https://elsastredelapasta.com/
curl -s https://elsastredelapasta.com/api/publico/productos | head -c 300
```

Expected: los dos primeros comandos devuelven `200`; el tercero devuelve el mismo JSON público que en Task 1, ahora también a través de nginx/HTTPS.

- [ ] **Step 2: Pedirle al usuario que confirme visualmente**

Como no hay navegador headless disponible en este servidor (ver limitación ya señalada en la sesión), este paso lo hace el usuario: recargar `https://elsastredelapasta.com/` (con hard-refresh) y confirmar:
- El botón "🍝 Hacé tu pedido por WhatsApp" abre un chat con el mensaje pre-armado.
- Debajo aparece el catálogo: chips de categoría arriba, tarjetas de producto abajo.
- Tocar un chip filtra correctamente; "Todos" muestra todo.
- Un producto con stock 0 (si hay alguno cargado) muestra "Sin stock" en vez de desaparecer.
- El resto de la portada (dirección, horarios, WhatsApp, Instagram, link "Ingresar") sigue igual que antes.

- [ ] **Step 3: Confirmar con el usuario antes de mergear**

No mergear `mejoras-ux-2026-07` a `master` ni tocar nada más hasta que el usuario confirme explícitamente que probó el sitio y quedó conforme (ver Global Constraints).
