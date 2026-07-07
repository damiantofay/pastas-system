# Códigos de barra en Productos y Vender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escanear códigos de barra (lector USB/Bluetooth) para dar de alta productos, actualizar precios y vender más rápido en el sistema de "El Sastre de la Pasta", cubriendo tanto productos de reventa (con código de fábrica) como pastas propias (con código interno generado por el sistema), incluyendo productos vendidos por peso.

**Architecture:** Se agregan tres columnas y una tabla nueva a la base SQLite existente (`producto.codigo_barra/tipo/costo_compra`, `recepcion_mercaderia`), tres endpoints nuevos y ajustes a los existentes en `server.js`, un módulo compartido `public/js/scanner.js` que captura el escaneo (input oculto siempre enfocado, patrón estándar para lectores tipo teclado) usado por `productos.js` y `vender.js`, y generación de la imagen del código de barras en el backend con la librería `bwip-js` (en vez de un encoder escrito a mano, para evitar errores de codificación no detectables sin un lector físico).

**Tech Stack:** Node.js + Express + better-sqlite3 (con fallback a `node:sqlite`) ya existentes. Nueva dependencia npm: `bwip-js` (JS puro, sin compilación nativa). Frontend: JS plano con módulos ES nativos del navegador, sin bundler (se mantiene el estilo del proyecto).

## Global Constraints

- `codigo_barra` es único **por sucursal**, no global: índice `UNIQUE(sucursal_id, codigo_barra)` que ignora `NULL`.
- No se integra con balanzas que imprimen etiquetas con peso/precio embebido — el peso se sigue tipeando a mano tras pesar en balanza común (confirmado con el usuario).
- No se usa ningún CDN externo ni encoder de código de barras escrito a mano — `bwip-js` como dependencia real de `package.json`.
- El proyecto no tiene framework de tests automatizados: toda verificación es manual, con `curl`/scripts de Node de un solo uso contra una base de datos temporal (nunca contra `data/fabrica.db` de producción) y pruebas en el navegador, siguiendo el mismo patrón que `docs/superpowers/plans/2026-07-05-portada-institucional.md`.
- Evitar `db.transaction()` (no disponible en el driver de fallback `node:sqlite`); usar el patrón manual `BEGIN`/`COMMIT`/`ROLLBACK` ya usado en `/api/produccion` (`server.js`).
- No modificar `auth.js`, el esquema de roles, ni las vistas `caja.js`, `stock.js`, `gastos.js`, `reportes.js`, `ajustes.js`.
- Reusar los helpers de frontend ya existentes (`el`, `modal`, `cerrarModal`, `input`, `select`, `campo`, `toast`, `confirmar`, `API.get/post/put/del`) sin duplicarlos.
- Los mensajes de error y toda la interfaz van en español, siguiendo el estilo ya usado en el proyecto.

---

### Task 1: Esquema de datos y helpers de negocio (`db.js`)

**Files:**
- Modify: `db.js` (agregar migración de columnas, tabla `recepcion_mercaderia`, y funciones `generarCodigoInterno`, `buscarProductoPorCodigo`, `registrarRecepcionMercaderia`)
- Test: verificación manual con Node contra bases de datos temporales (no hay framework de tests en el proyecto)

**Interfaces:**
- Consumes: nada nuevo (usa `db`, `round2`, `ahoraAR` ya definidos en el propio archivo).
- Produces (usado por Task 2): `D.generarCodigoInterno(): string`, `D.buscarProductoPorCodigo(codigo: string, sucursalId: number): objeto fila de `producto` o `undefined`, `D.registrarRecepcionMercaderia(productoId: number, sucursalId: number, { cantidad, costoTotal, pagadoCon, fecha }): { id: number, costo_unitario: number }`. Columnas nuevas en `producto`: `codigo_barra` (TEXT, nullable), `tipo` (TEXT, `'elaborado'` u `'reventa'`), `costo_compra` (REAL). Tabla nueva `recepcion_mercaderia`.

- [ ] **Step 1: Agregar la migración de columnas e índice después de `crearEsquema()`**

En `db.js`, después de la función `crearEsquema()` (justo antes de la sección `// ---- Helpers de config`), agregar:

```javascript
// ---- Migración: columnas agregadas después del esquema inicial --------
function migrarEsquema() {
  const columnas = db.prepare("PRAGMA table_info(producto)").all().map((c) => c.name);
  if (!columnas.includes('codigo_barra')) {
    db.exec('ALTER TABLE producto ADD COLUMN codigo_barra TEXT');
  }
  if (!columnas.includes('tipo')) {
    db.exec("ALTER TABLE producto ADD COLUMN tipo TEXT NOT NULL DEFAULT 'elaborado'");
  }
  if (!columnas.includes('costo_compra')) {
    db.exec('ALTER TABLE producto ADD COLUMN costo_compra REAL NOT NULL DEFAULT 0');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_codigo
    ON producto(sucursal_id, codigo_barra) WHERE codigo_barra IS NOT NULL
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS recepcion_mercaderia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sucursal_id INTEGER NOT NULL DEFAULT 1,
      producto_id INTEGER NOT NULL REFERENCES producto(id),
      fecha TEXT NOT NULL,
      cantidad REAL NOT NULL,
      costo_total REAL NOT NULL,
      pagado_con TEXT NOT NULL DEFAULT 'efectivo'
    )
  `);
}
```

- [ ] **Step 2: Llamar a la migración al cargar el módulo**

Buscar la línea (cerca del final del archivo, antes de `module.exports`):

```javascript
crearEsquema();
```

Reemplazar por:

```javascript
crearEsquema();
migrarEsquema();
```

- [ ] **Step 3: Agregar las funciones de negocio para código interno y recepción de mercadería**

Justo después de la función `costoProducto` (y antes de `function round2`), agregar:

```javascript
// ---- Código de barras interno y recepción de mercadería (reventa) --------
function generarCodigoInterno() {
  const r = db.prepare(
    "SELECT MAX(CAST(SUBSTR(codigo_barra,4) AS INTEGER)) AS maximo FROM producto WHERE codigo_barra LIKE 'PP-%'"
  ).get();
  const siguiente = (r.maximo || 0) + 1;
  return 'PP-' + String(siguiente).padStart(6, '0');
}

function buscarProductoPorCodigo(codigo, sucursalId) {
  return db.prepare('SELECT * FROM producto WHERE codigo_barra = ? AND sucursal_id = ?')
    .get(String(codigo).trim(), sucursalId);
}

function registrarRecepcionMercaderia(productoId, sucursalId, { cantidad, costoTotal, pagadoCon = 'efectivo', fecha }) {
  const cant = Number(cantidad);
  const costo = Number(costoTotal);
  if (!(cant > 0)) throw new Error('La cantidad recibida debe ser mayor a 0');
  if (!(costo >= 0)) throw new Error('El costo total no puede ser negativo');
  const f = fecha || ahoraAR();
  const costoUnitario = round2(costo / cant);
  db.exec('BEGIN');
  try {
    const ins = db.prepare(
      'INSERT INTO recepcion_mercaderia (sucursal_id, producto_id, fecha, cantidad, costo_total, pagado_con) VALUES (?,?,?,?,?,?)'
    ).run(sucursalId, productoId, f, cant, costo, pagadoCon);
    db.prepare('UPDATE producto SET stock = stock + ?, costo_compra = ? WHERE id = ?')
      .run(cant, costoUnitario, productoId);
    db.exec('COMMIT');
    return { id: Number(ins.lastInsertRowid), costo_unitario: costoUnitario };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
```

- [ ] **Step 4: Exportar las funciones nuevas**

Buscar el bloque `module.exports` (cerca del final del archivo):

```javascript
module.exports = {
  db, driver, DB_PATH,
  ahoraAR, hoyAR, mesAR,
  getConfig, getConfigNum, setConfig,
  overheadPorMinuto, costoProducto, round2, seed,
  hashPassword, verifyPassword, getUsuarioPorLogin, getUsuario, listarUsuarios,
  crearUsuario, cambiarPassword, hayUsuarios, getSessionSecret
};
```

Reemplazar por:

```javascript
module.exports = {
  db, driver, DB_PATH,
  ahoraAR, hoyAR, mesAR,
  getConfig, getConfigNum, setConfig,
  overheadPorMinuto, costoProducto, round2, seed,
  hashPassword, verifyPassword, getUsuarioPorLogin, getUsuario, listarUsuarios,
  crearUsuario, cambiarPassword, hayUsuarios, getSessionSecret,
  generarCodigoInterno, buscarProductoPorCodigo, registrarRecepcionMercaderia
};
```

- [ ] **Step 5: Verificar la migración contra una copia real de la base de producción**

Esto confirma que la migración no rompe ni pierde datos existentes (los 7 productos ya cargados en producción). Usa el mismo método de copia consistente que ya usa `/root/backup-fabrica.sh` (no un `cp` plano, para que la copia sea consistente aunque el server esté escribiendo en modo WAL):

```bash
cd /root/fabrica-pastas
node -e "
const Database = require('./node_modules/better-sqlite3');
const db = new Database('/root/fabrica-pastas/data/fabrica.db', { readonly: true, fileMustExist: true });
db.backup('/tmp/fabrica-test-task1.db').then(() => { db.close(); console.log('copia lista'); });
"
DB_PATH=/tmp/fabrica-test-task1.db node -e "
const D = require('./db');
const cols = D.db.prepare('PRAGMA table_info(producto)').all().map((c) => c.name);
console.log('columnas nuevas presentes:', cols.includes('codigo_barra'), cols.includes('tipo'), cols.includes('costo_compra'));
const tablas = D.db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map((t) => t.name);
console.log('recepcion_mercaderia existe:', tablas.includes('recepcion_mercaderia'));
const filas = D.db.prepare('SELECT id, nombre, tipo, codigo_barra, costo_compra FROM producto').all();
console.log('productos existentes tras migrar:', filas);
console.log('primer codigo generado:', D.generarCodigoInterno());
"
rm -f /tmp/fabrica-test-task1.db
```

Expected: `columnas nuevas presentes: true true true`, `recepcion_mercaderia existe: true`, la lista de productos muestra los mismos productos que ya existen en producción (mismo `id`/`nombre` de siempre) con `tipo: 'elaborado'`, `codigo_barra: null`, `costo_compra: 0` — es decir, no se perdió ningún dato. `primer codigo generado` imprime `PP-000001`.

- [ ] **Step 6: Verificar en una base nueva desde cero (instalación limpia)**

```bash
cd /root/fabrica-pastas
rm -f /tmp/fabrica-test-nueva.db
DB_PATH=/tmp/fabrica-test-nueva.db node -e "
const D = require('./db');
console.log(D.generarCodigoInterno());
D.db.prepare(\"INSERT INTO producto (nombre, codigo_barra, tipo) VALUES ('Prueba', 'PP-000001', 'elaborado')\").run();
console.log(D.generarCodigoInterno());
console.log(D.buscarProductoPorCodigo('PP-000001', 1).nombre);
const r = D.db.prepare(\"INSERT INTO producto (nombre, tipo) VALUES ('Reventa prueba', 'reventa')\").run();
const res = D.registrarRecepcionMercaderia(Number(r.lastInsertRowid), 1, { cantidad: 10, costoTotal: 500 });
console.log('recepcion:', res);
console.log(D.db.prepare('SELECT stock, costo_compra FROM producto WHERE id = ?').get(Number(r.lastInsertRowid)));
try {
  D.db.prepare(\"INSERT INTO producto (nombre, codigo_barra, tipo) VALUES ('Duplicado', 'PP-000001', 'elaborado')\").run();
  console.log('ERROR: debería haber fallado por índice único');
} catch (e) { console.log('duplicado rechazado correctamente:', e.message); }
"
rm -f /tmp/fabrica-test-nueva.db
```

Expected: primer código `PP-000001`, segundo código (tras insertar el primero) `PP-000002`, `buscarProductoPorCodigo` devuelve `Prueba`, `recepcion` devuelve `{ id: 1, costo_unitario: 50 }`, la fila del producto de reventa muestra `stock: 10, costo_compra: 50`, y el intento de insertar un código duplicado imprime `duplicado rechazado correctamente` con un mensaje de SQLite sobre restricción única.

- [ ] **Step 7: Commit**

```bash
cd /root/fabrica-pastas
git add db.js
git commit -m "Agregar codigo_barra, tipo, costo_compra y recepcion_mercaderia a producto"
```

---

### Task 2: Backend de productos — tipo, código, costo y recepción (`server.js`)

**Files:**
- Modify: `server.js:207-221` (`leerProductoBody`), `server.js:224-238` (`POST /api/productos`), `server.js:240-254` (`PUT /api/productos/:id`), `server.js:165-183` (`productoConCosto`)
- (Los números de línea son aproximados sobre el archivo original; ubicar por el texto exacto de cada bloque, que puede haberse corrido levemente.)

**Interfaces:**
- Consumes: `D.generarCodigoInterno`, `D.buscarProductoPorCodigo`, `D.registrarRecepcionMercaderia` de Task 1.
- Produces (usado por Task 3, 6 y 7): `GET /api/productos/codigo/:codigo` → 200 con el producto (mismo formato que ya devuelve `GET /api/productos/:id`, con `costo_unitario`/`margen_pct`/etc.) o 404 `{ error }`. `POST /api/productos/:id/codigo` → genera y asigna código interno si no tiene. `POST /api/productos/:id/recepcion` con body `{ cantidad, costo_total, pagado_con? }` → `{ ok: true, id, costo_unitario, producto }`. `producto.tipo` y `producto.codigo_barra` ahora viajan en todas las respuestas de `/api/productos*` (ya que son columnas de la tabla y el código usa `SELECT *`).

- [ ] **Step 1: Actualizar `leerProductoBody` para leer `tipo` y `codigo_barra`**

Ubicar en `server.js`:

```javascript
function leerProductoBody(b, cur = {}) {
  return {
    nombre: (b.nombre != null ? String(b.nombre) : cur.nombre || '').trim(),
    categoria: (b.categoria != null ? String(b.categoria) : cur.categoria || 'General').trim() || 'General',
    unidad_stock: ['unidad', 'kg'].includes(b.unidad_stock) ? b.unidad_stock : (cur.unidad_stock || 'unidad'),
    minutos_mano_obra: b.minutos_mano_obra != null ? num(b.minutos_mano_obra) : (cur.minutos_mano_obra || 0),
```

Reemplazar por:

```javascript
function leerProductoBody(b, cur = {}) {
  return {
    nombre: (b.nombre != null ? String(b.nombre) : cur.nombre || '').trim(),
    categoria: (b.categoria != null ? String(b.categoria) : cur.categoria || 'General').trim() || 'General',
    unidad_stock: ['unidad', 'kg'].includes(b.unidad_stock) ? b.unidad_stock : (cur.unidad_stock || 'unidad'),
    tipo: ['elaborado', 'reventa'].includes(b.tipo) ? b.tipo : (cur.tipo || 'elaborado'),
    codigo_barra: b.codigo_barra != null ? (String(b.codigo_barra).trim() || null) : (cur.codigo_barra ?? null),
    minutos_mano_obra: b.minutos_mano_obra != null ? num(b.minutos_mano_obra) : (cur.minutos_mano_obra || 0),
```

- [ ] **Step 2: Agregar el helper de validación de código único**

Justo antes de `app.post('/api/productos', ...)`, agregar:

```javascript
function chequearCodigoUnico(codigo, sucursalId, excluirId) {
  if (!codigo) return;
  const fila = db.prepare(
    'SELECT id, nombre FROM producto WHERE codigo_barra = ? AND sucursal_id = ? AND id != ?'
  ).get(codigo, sucursalId, excluirId || 0);
  if (fila) throw new Error(`Ese código ya está asignado a "${fila.nombre}"`);
}
```

- [ ] **Step 3: Actualizar `POST /api/productos` (autogenerar código para elaborados, validar duplicados)**

Ubicar:

```javascript
app.post('/api/productos', h((req, res) => {
  const d = leerProductoBody(req.body);
  if (!d.nombre) throw new Error('Falta el nombre del producto');
  const r = db.prepare(`INSERT INTO producto
    (sucursal_id, nombre, categoria, unidad_stock, minutos_mano_obra, precio_unidad, precio_docena, precio_kg,
     vende_unidad, vende_docena, vende_kg, vende_monto, stock)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`).run(
    suc(req), d.nombre, d.categoria, d.unidad_stock, d.minutos_mano_obra,
    d.precio_unidad, d.precio_docena, d.precio_kg,
    d.vende_unidad, d.vende_docena, d.vende_kg, d.vende_monto
  );
  // receta opcional al crear
  if (Array.isArray(req.body.receta)) guardarReceta(lastId(r), req.body.receta);
  res.json(db.prepare('SELECT * FROM producto WHERE id = ?').get(lastId(r)));
}));
```

Reemplazar por:

```javascript
app.post('/api/productos', h((req, res) => {
  const d = leerProductoBody(req.body);
  if (!d.nombre) throw new Error('Falta el nombre del producto');
  chequearCodigoUnico(d.codigo_barra, suc(req), 0);
  if (d.tipo === 'elaborado' && !d.codigo_barra) d.codigo_barra = D.generarCodigoInterno();
  const r = db.prepare(`INSERT INTO producto
    (sucursal_id, nombre, categoria, unidad_stock, tipo, codigo_barra, minutos_mano_obra, precio_unidad, precio_docena, precio_kg,
     vende_unidad, vende_docena, vende_kg, vende_monto, stock)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).run(
    suc(req), d.nombre, d.categoria, d.unidad_stock, d.tipo, d.codigo_barra, d.minutos_mano_obra,
    d.precio_unidad, d.precio_docena, d.precio_kg,
    d.vende_unidad, d.vende_docena, d.vende_kg, d.vende_monto
  );
  // receta opcional al crear
  if (Array.isArray(req.body.receta)) guardarReceta(lastId(r), req.body.receta);
  res.json(db.prepare('SELECT * FROM producto WHERE id = ?').get(lastId(r)));
}));
```

- [ ] **Step 4: Actualizar `PUT /api/productos/:id` (validar duplicados)**

Ubicar:

```javascript
app.put('/api/productos/:id', h((req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM producto WHERE id = ?').get(id);
  if (!cur) throw new Error('Producto no encontrado');
  const d = leerProductoBody(req.body, cur);
  db.prepare(`UPDATE producto SET nombre=?, categoria=?, unidad_stock=?, minutos_mano_obra=?,
    precio_unidad=?, precio_docena=?, precio_kg=?,
    vende_unidad=?, vende_docena=?, vende_kg=?, vende_monto=? WHERE id=?`).run(
    d.nombre, d.categoria, d.unidad_stock, d.minutos_mano_obra,
    d.precio_unidad, d.precio_docena, d.precio_kg,
    d.vende_unidad, d.vende_docena, d.vende_kg, d.vende_monto, id
  );
  if (Array.isArray(req.body.receta)) guardarReceta(id, req.body.receta);
  res.json(db.prepare('SELECT * FROM producto WHERE id = ?').get(id));
}));
```

Reemplazar por:

```javascript
app.put('/api/productos/:id', h((req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM producto WHERE id = ?').get(id);
  if (!cur) throw new Error('Producto no encontrado');
  const d = leerProductoBody(req.body, cur);
  chequearCodigoUnico(d.codigo_barra, cur.sucursal_id, id);
  db.prepare(`UPDATE producto SET nombre=?, categoria=?, unidad_stock=?, tipo=?, codigo_barra=?, minutos_mano_obra=?,
    precio_unidad=?, precio_docena=?, precio_kg=?,
    vende_unidad=?, vende_docena=?, vende_kg=?, vende_monto=? WHERE id=?`).run(
    d.nombre, d.categoria, d.unidad_stock, d.tipo, d.codigo_barra, d.minutos_mano_obra,
    d.precio_unidad, d.precio_docena, d.precio_kg,
    d.vende_unidad, d.vende_docena, d.vende_kg, d.vende_monto, id
  );
  if (Array.isArray(req.body.receta)) guardarReceta(id, req.body.receta);
  res.json(db.prepare('SELECT * FROM producto WHERE id = ?').get(id));
}));
```

- [ ] **Step 5: Actualizar `productoConCosto` para calcular costo/margen de reventa desde `costo_compra`**

Ubicar:

```javascript
function productoConCosto(p, ohPorMin, costoHora) {
  const c = D.costoProducto(p.id, { overheadPorMinuto: ohPorMin, costoHora });
  const costo = c ? c.total : 0;
  // precio de referencia para el margen: el primero habilitado
  let precioRef = 0, baseRef = '';
```

Reemplazar por:

```javascript
function productoConCosto(p, ohPorMin, costoHora) {
  let costo, c;
  if (p.tipo === 'reventa') {
    costo = p.costo_compra || 0;
    c = null;
  } else {
    c = D.costoProducto(p.id, { overheadPorMinuto: ohPorMin, costoHora });
    costo = c ? c.total : 0;
  }
  // precio de referencia para el margen: el primero habilitado
  let precioRef = 0, baseRef = '';
```

- [ ] **Step 6: Agregar los endpoints de código y recepción**

Justo después de `app.put('/api/productos/:id/receta', ...)` (que termina con `res.json({ ok: true });\n}));`), agregar:

```javascript
app.get('/api/productos/codigo/:codigo', h((req, res) => {
  const p = D.buscarProductoPorCodigo(req.params.codigo, suc(req));
  if (!p) return res.status(404).json({ error: 'No hay ningún producto con ese código' });
  res.json(productoConCosto(p, D.overheadPorMinuto(), D.getConfigNum('costo_hora', 0)));
}));

app.post('/api/productos/:id/codigo', h((req, res) => {
  const id = +req.params.id;
  const p = db.prepare('SELECT * FROM producto WHERE id = ?').get(id);
  if (!p) throw new Error('Producto no encontrado');
  if (!p.codigo_barra) {
    const codigo = D.generarCodigoInterno();
    db.prepare('UPDATE producto SET codigo_barra = ? WHERE id = ?').run(codigo, id);
  }
  res.json(db.prepare('SELECT * FROM producto WHERE id = ?').get(id));
}));

app.post('/api/productos/:id/recepcion', h((req, res) => {
  const id = +req.params.id;
  const p = db.prepare('SELECT * FROM producto WHERE id = ?').get(id);
  if (!p) throw new Error('Producto no encontrado');
  if (p.tipo !== 'reventa') throw new Error('Solo los productos de reventa reciben mercadería por esta vía');
  const r = D.registrarRecepcionMercaderia(id, p.sucursal_id, {
    cantidad: req.body.cantidad, costoTotal: req.body.costo_total, pagadoCon: req.body.pagado_con
  });
  res.json({ ok: true, ...r, producto: db.prepare('SELECT * FROM producto WHERE id = ?').get(id) });
}));
```

- [ ] **Step 7: Verificar con curl contra un servidor y base de datos temporales**

```bash
cd /root/fabrica-pastas
rm -f /tmp/test-fabrica-task2.db
DB_PATH=/tmp/test-fabrica-task2.db node db.js --crear-admin test_admin test1234 "Test Admin"
DB_PATH=/tmp/test-fabrica-task2.db PORT=3099 node server.js &
sleep 1
COOKIES=/tmp/cookies-task2.txt
curl -s -c "$COOKIES" -X POST http://localhost:3099/api/login \
  -H 'Content-Type: application/json' -d '{"usuario":"test_admin","contrasena":"test1234"}'
echo
echo "--- crear elaborado sin codigo (se autogenera) ---"
curl -s -b "$COOKIES" -X POST http://localhost:3099/api/productos -H 'Content-Type: application/json' \
  -d '{"nombre":"Ravioles de prueba","categoria":"Rellenas","unidad_stock":"unidad","tipo":"elaborado","precio_unidad":300,"vende_unidad":1}'
echo
echo "--- crear reventa con codigo de fabrica ---"
curl -s -b "$COOKIES" -X POST http://localhost:3099/api/productos -H 'Content-Type: application/json' \
  -d '{"nombre":"Gaseosa 1.5L","categoria":"Bebidas","tipo":"reventa","codigo_barra":"7791234567890","precio_unidad":2500,"vende_unidad":1}'
echo
echo "--- buscar por codigo generado ---"
curl -s -b "$COOKIES" http://localhost:3099/api/productos/codigo/PP-000001
echo
echo "--- buscar codigo inexistente (debe dar 404) ---"
curl -s -o /dev/null -w "status=%{http_code}\n" -b "$COOKIES" http://localhost:3099/api/productos/codigo/NOEXISTE
echo "--- registrar recepcion de mercaderia para la gaseosa (id=2) ---"
curl -s -b "$COOKIES" -X POST http://localhost:3099/api/productos/2/recepcion -H 'Content-Type: application/json' \
  -d '{"cantidad": 24, "costo_total": 36000}'
echo
echo "--- ver margen de la gaseosa tras la recepcion ---"
curl -s -b "$COOKIES" http://localhost:3099/api/productos/2 | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);console.log('costo_unitario:',p.costo_unitario,'margen_pct:',p.margen_pct);})"
echo "--- intentar duplicar codigo (debe fallar con 400) ---"
curl -s -o /dev/null -w "status=%{http_code}\n" -b "$COOKIES" -X PUT http://localhost:3099/api/productos/1 -H 'Content-Type: application/json' \
  -d '{"codigo_barra":"7791234567890"}'
kill %1
rm -f /tmp/test-fabrica-task2.db "$COOKIES"
```

Expected: el login responde con `{"nombre":"Test Admin",...}`. El elaborado creado sin código trae `"codigo_barra":"PP-000001"`. La reventa trae `"codigo_barra":"7791234567890"`. La búsqueda por `PP-000001` devuelve el ravioles de prueba. El código inexistente da `status=404`. La recepción devuelve `{"ok":true,"id":1,"costo_unitario":1500,...}`. El costo/margen de la gaseosa tras la recepción muestra `costo_unitario: 1500` y un `margen_pct` mayor a 0 (porque `precio_unidad` es 2500). El intento de duplicar el código de la gaseosa en el producto 1 da `status=400`.

- [ ] **Step 8: Commit**

```bash
cd /root/fabrica-pastas
git add server.js
git commit -m "Agregar tipo, codigo de barras y recepcion de mercaderia a la API de productos"
```

---

### Task 3: Generación de la imagen del código de barras (`bwip-js`)

**Files:**
- Modify: `package.json` (agregar dependencia `bwip-js`)
- Modify: `server.js` (nuevo endpoint `GET /api/productos/:id/etiqueta.png`)

**Interfaces:**
- Consumes: nada nuevo de tasks anteriores más que la columna `codigo_barra` (Task 1).
- Produces (usado por Task 8): `GET /api/productos/:id/etiqueta.png` → `image/png` con el código de barras Code128 del producto, o error JSON si no tiene código.

- [ ] **Step 1: Agregar la dependencia**

```bash
cd /root/fabrica-pastas
npm install bwip-js
```

- [ ] **Step 2: Verificar la instalación**

```bash
node -e "const bwipjs = require('bwip-js'); console.log(typeof bwipjs.toBuffer);"
```

Expected: `function`

- [ ] **Step 3: Agregar el require al principio de `server.js`**

Ubicar:

```javascript
const D = require('./db');
const { db } = D;
```

Reemplazar por:

```javascript
const D = require('./db');
const { db } = D;
const bwipjs = require('bwip-js');
```

- [ ] **Step 4: Agregar el endpoint**

Justo después del endpoint `app.post('/api/productos/:id/recepcion', ...)` agregado en Task 2, agregar:

```javascript
// No se envuelve con h() porque bwip-js devuelve una Promise y h() solo
// atrapa errores síncronos; el manejo de error va explícito acá.
app.get('/api/productos/:id/etiqueta.png', (req, res) => {
  const p = db.prepare('SELECT * FROM producto WHERE id = ?').get(+req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  if (!p.codigo_barra) return res.status(400).json({ error: 'Este producto todavía no tiene código de barras' });
  bwipjs.toBuffer({
    bcid: 'code128',
    text: p.codigo_barra,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center'
  }).then((png) => {
    res.set('Content-Type', 'image/png');
    res.send(png);
  }).catch((err) => {
    res.status(400).json({ error: 'No se pudo generar el código de barras: ' + (err.message || err) });
  });
});
```

- [ ] **Step 5: Verificar generando una etiqueta real por curl**

```bash
cd /root/fabrica-pastas
rm -f /tmp/test-fabrica-task3.db
DB_PATH=/tmp/test-fabrica-task3.db node db.js --crear-admin test_admin test1234 "Test Admin"
DB_PATH=/tmp/test-fabrica-task3.db PORT=3098 node server.js &
sleep 1
COOKIES=/tmp/cookies-task3.txt
curl -s -c "$COOKIES" -X POST http://localhost:3098/api/login -H 'Content-Type: application/json' -d '{"usuario":"test_admin","contrasena":"test1234"}' > /dev/null
curl -s -b "$COOKIES" -X POST http://localhost:3098/api/productos -H 'Content-Type: application/json' \
  -d '{"nombre":"Ravioles de prueba","tipo":"elaborado","precio_unidad":300,"vende_unidad":1}' > /dev/null
curl -s -b "$COOKIES" http://localhost:3098/api/productos/1/etiqueta.png -o /tmp/etiqueta-test.png -w "status=%{http_code} content-type=%{content_type}\n"
file /tmp/etiqueta-test.png
kill %1
rm -f /tmp/test-fabrica-task3.db "$COOKIES" /tmp/etiqueta-test.png
```

Expected: `status=200 content-type=image/png`, y `file` reporta algo como `PNG image data, ... x ...`. Si es posible, abrir `/tmp/etiqueta-test.png` (antes de borrarlo) en un visor de imágenes y confirmar visualmente que se ve un código de barras legible con el texto `PP-000001` debajo.

- [ ] **Step 6: Commit**

```bash
cd /root/fabrica-pastas
git add package.json package-lock.json server.js
git commit -m "Generar la imagen del codigo de barras de cada producto con bwip-js"
```

---

### Task 4: Mecanismo de escaneo compartido (`public/js/scanner.js`)

**Files:**
- Create: `public/js/scanner.js`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces (usado por Task 6 y 7): `activarEscaner(onScan: (codigo: string) => void): void` — registra el callback que se dispara con el código leído. `desactivarEscaner(): void` — desactiva el callback actual (se llama automáticamente al cambiar de vista).

- [ ] **Step 1: Crear `public/js/scanner.js`**

```javascript
// Captura de lectores de código de barra USB/Bluetooth (funcionan como
// teclado: tipean el código muy rápido y terminan con Enter). Se mantiene
// un input invisible siempre enfocado mientras no haya un modal abierto,
// para no depender de heurísticas de tiempo entre teclas.

let inputEl = null;
let callback = null;
let intervaloId = null;

function existeModalAbierto() {
  const root = document.getElementById('modal-root');
  return !!(root && root.firstChild);
}

function crearInput() {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.setAttribute('aria-hidden', 'true');
  inp.tabIndex = -1;
  inp.autocomplete = 'off';
  inp.style.position = 'fixed';
  inp.style.top = '0';
  inp.style.left = '-9999px';
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = inp.value.trim();
    inp.value = '';
    // Se ignora mientras haya un modal abierto (cantidad, cobro, formularios)
    // para no interrumpir lo que se está cargando ahí.
    if (valor && callback && !existeModalAbierto()) callback(valor);
  });
  document.body.appendChild(inp);
  return inp;
}

function reenfocar() {
  if (!inputEl || !callback) return;
  if (existeModalAbierto()) return;
  if (document.activeElement !== inputEl) inputEl.focus({ preventScroll: true });
}

export function activarEscaner(onScan) {
  callback = onScan;
  if (!inputEl) inputEl = crearInput();
  if (!intervaloId) intervaloId = setInterval(reenfocar, 400);
  reenfocar();
}

export function desactivarEscaner() {
  callback = null;
}
```

- [ ] **Step 2: Desactivar el escáner al cambiar de vista en `app.js`**

Ubicar en `public/js/app.js`:

```javascript
import API from './api.js';
import { el, clear, toast, iconos } from './ui.js';
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, toast, iconos } from './ui.js';
import { desactivarEscaner } from './scanner.js';
```

Ubicar:

```javascript
async function montar(id) {
  const v = VISTAS.find((x) => x.id === id);
  if (!v) return;
  actual = id;
  pintarNav();
  clear(main).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
```

Reemplazar por:

```javascript
async function montar(id) {
  const v = VISTAS.find((x) => x.id === id);
  if (!v) return;
  actual = id;
  pintarNav();
  desactivarEscaner();
  clear(main).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
```

- [ ] **Step 3: Verificar manualmente en el navegador**

```bash
cd /root/fabrica-pastas
npm start &
sleep 1
```

En el navegador: iniciar sesión, ir a "Productos". Sin tocar ningún campo, escribir en el teclado `TESTSCAN123` seguido de Enter (el input oculto ya tiene el foco, así que funciona igual que un lector físico). Confirmar en la consola del navegador que no hay errores. Ir a "Vender" y repetir. Ir a "Caja" y repetir: como esa vista no llama a `activarEscaner`, no debería pasar nada (todavía no hay wiring de `onScan` en Task 4, así que esta verificación solo confirma que no rompe nada; el comportamiento completo se prueba en Task 6/7).

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /root/fabrica-pastas
git add public/js/scanner.js public/js/app.js
git commit -m "Agregar mecanismo compartido de captura de escaneo de codigo de barras"
```

---

### Task 5: Formulario de Productos — tipo y código de barras

**Files:**
- Modify: `public/js/productos.js`

**Interfaces:**
- Consumes: nada de tasks anteriores directamente (usa la API ya extendida en Task 2).
- Produces (usado por Task 6): `abrirForm(cont, p, codigoPrellenado)` — nuevo tercer parámetro opcional para prellenar el código al abrir el alta desde un escaneo de código desconocido.

- [ ] **Step 1: Agregar los campos de tipo y código al formulario**

Ubicar en `public/js/productos.js`:

```javascript
function abrirForm(cont, p) {
  const esNuevo = !p;
  p = p || { nombre: '', categoria: 'General', unidad_stock: 'unidad', minutos_mano_obra: 0,
    precio_unidad: 0, precio_docena: 0, precio_kg: 0, vende_unidad: 1, vende_docena: 0, vende_kg: 0, vende_monto: 1 };

  const inNombre = input({ value: p.nombre, placeholder: 'Ej: Ravioles de ricota' });
  const inCat = input({ value: p.categoria, placeholder: 'Ej: Rellenas' });
  const inUnidad = select([{ value: 'unidad', label: 'Por unidad (se cuenta)' }, { value: 'kg', label: 'Por kilo (se pesa)' }], p.unidad_stock);
  const inMin = input({ type: 'number', step: '0.1', value: p.minutos_mano_obra, inputmode: 'decimal' });
```

Reemplazar por:

```javascript
function abrirForm(cont, p, codigoPrellenado) {
  const esNuevo = !p;
  p = p || { nombre: '', categoria: 'General', unidad_stock: 'unidad', tipo: 'elaborado', codigo_barra: codigoPrellenado || '',
    minutos_mano_obra: 0, precio_unidad: 0, precio_docena: 0, precio_kg: 0, vende_unidad: 1, vende_docena: 0, vende_kg: 0, vende_monto: 1 };

  const inNombre = input({ value: p.nombre, placeholder: 'Ej: Ravioles de ricota' });
  const inCat = input({ value: p.categoria, placeholder: 'Ej: Rellenas' });
  const inUnidad = select([{ value: 'unidad', label: 'Por unidad (se cuenta)' }, { value: 'kg', label: 'Por kilo (se pesa)' }], p.unidad_stock);
  const inTipo = select([{ value: 'elaborado', label: 'Elaborado (con receta propia)' }, { value: 'reventa', label: 'Reventa (comprado ya terminado)' }], p.tipo || 'elaborado');
  const inCodigo = input({ value: p.codigo_barra || codigoPrellenado || '', placeholder: 'Escaneá el código o dejalo vacío' });
  const inMin = input({ type: 'number', step: '0.1', value: p.minutos_mano_obra, inputmode: 'decimal' });
```

- [ ] **Step 2: Envolver la sección de receta para poder ocultarla en productos de reventa**

Ubicar:

```javascript
  const form = el('div', {}, [
    campo('Nombre', inNombre),
    el('div', { class: 'campos-2' }, [campo('Categoría', inCat), campo('Se vende', inUnidad)]),
    campo('Formas de venta', el('div', { class: 'switches' }, [swU.node, swD.node, swK.node, swM.node]), 'Marcá todas las que uses para este producto.'),
    el('div', { class: 'campos-2' }, [
      campo('Precio por unidad', inPU),
      campo('Precio por docena', inPD)
    ]),
    el('div', { class: 'campos-2' }, [
      campo('Precio por kilo', inPK),
      campo('Minutos de trabajo', inMin, `por ${p.unidad_stock === 'kg' ? 'kilo' : 'unidad'} producido`)
    ]),
    el('h3', { text: 'Receta', style: { marginTop: '8px' } }),
    el('p', { class: 'ayuda', text: 'Cuánto de cada ingrediente lleva 1 ' + (p.unidad_stock === 'kg' ? 'kilo' : 'unidad') + '. Sirve para calcular el costo y descontar stock al producir.' }),
    recetaCont,
    el('button', { class: 'btn btn-fantasma btn-chico', text: '+ Agregar ingrediente', onClick: () => addFilaReceta(), style: { marginTop: '6px' } })
  ]);
```

Reemplazar por:

```javascript
  const recetaSeccion = el('div', {}, [
    el('h3', { text: 'Receta', style: { marginTop: '8px' } }),
    el('p', { class: 'ayuda', text: 'Cuánto de cada ingrediente lleva 1 ' + (p.unidad_stock === 'kg' ? 'kilo' : 'unidad') + '. Sirve para calcular el costo y descontar stock al producir.' }),
    recetaCont,
    el('button', { class: 'btn btn-fantasma btn-chico', text: '+ Agregar ingrediente', onClick: () => addFilaReceta(), style: { marginTop: '6px' } })
  ]);
  const actualizarVisibilidadReceta = () => { recetaSeccion.style.display = inTipo.value === 'reventa' ? 'none' : ''; };
  inTipo.addEventListener('change', actualizarVisibilidadReceta);

  const form = el('div', {}, [
    campo('Nombre', inNombre),
    el('div', { class: 'campos-2' }, [campo('Categoría', inCat), campo('Se vende', inUnidad)]),
    el('div', { class: 'campos-2' }, [campo('Tipo', inTipo), campo('Código de barras', inCodigo, 'Escaneá con el lector, o dejalo vacío (se genera solo en elaborados).')]),
    campo('Formas de venta', el('div', { class: 'switches' }, [swU.node, swD.node, swK.node, swM.node]), 'Marcá todas las que uses para este producto.'),
    el('div', { class: 'campos-2' }, [
      campo('Precio por unidad', inPU),
      campo('Precio por docena', inPD)
    ]),
    el('div', { class: 'campos-2' }, [
      campo('Precio por kilo', inPK),
      campo('Minutos de trabajo', inMin, `por ${p.unidad_stock === 'kg' ? 'kilo' : 'unidad'} producido`)
    ]),
    recetaSeccion
  ]);
  actualizarVisibilidadReceta();
```

- [ ] **Step 3: Incluir `tipo` y `codigo_barra` al guardar**

Ubicar:

```javascript
    const payload = {
      nombre: inNombre.value, categoria: inCat.value, unidad_stock: inUnidad.value,
      minutos_mano_obra: parseFloat(inMin.value) || 0,
      precio_unidad: parseFloat(inPU.value) || 0,
      precio_docena: parseFloat(inPD.value) || 0,
      precio_kg: parseFloat(inPK.value) || 0,
      vende_unidad: swU.chk.checked, vende_docena: swD.chk.checked, vende_kg: swK.chk.checked, vende_monto: swM.chk.checked,
      receta
    };
```

Reemplazar por:

```javascript
    const payload = {
      nombre: inNombre.value, categoria: inCat.value, unidad_stock: inUnidad.value,
      tipo: inTipo.value, codigo_barra: inCodigo.value.trim() || null,
      minutos_mano_obra: parseFloat(inMin.value) || 0,
      precio_unidad: parseFloat(inPU.value) || 0,
      precio_docena: parseFloat(inPD.value) || 0,
      precio_kg: parseFloat(inPK.value) || 0,
      vende_unidad: swU.chk.checked, vende_docena: swD.chk.checked, vende_kg: swK.chk.checked, vende_monto: swM.chk.checked,
      receta: inTipo.value === 'reventa' ? [] : receta
    };
```

- [ ] **Step 4: Verificar en el navegador**

```bash
cd /root/fabrica-pastas
npm start &
sleep 1
```

En el navegador, ir a Productos → "+ Nuevo producto". Confirmar: aparecen los campos "Tipo" y "Código de barras". Al elegir tipo "Reventa" desaparece la sección "Receta"; al volver a "Elaborado" reaparece. Crear un producto elaborado sin escribir código y guardar: al reabrirlo con "Editar", el campo "Código de barras" ahora muestra `PP-000001` (o el siguiente disponible). Crear un producto de reventa con un código de barras cualquiera (por ejemplo `7791234567890`) y guardar: al reabrirlo, el código persiste y no aparece la sección de receta.

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
cd /root/fabrica-pastas
git add public/js/productos.js
git commit -m "Agregar tipo y codigo de barras al formulario de productos"
```

---

### Task 6: Escaneo en Productos — alta rápida y actualización rápida

**Files:**
- Modify: `public/js/productos.js`

**Interfaces:**
- Consumes: `activarEscaner` de Task 4, `GET /api/productos/codigo/:codigo` y `POST /api/productos/:id/recepcion` de Task 2, `abrirForm(cont, p, codigoPrellenado)` de Task 5.

- [ ] **Step 1: Importar `activarEscaner`**

Ubicar en `public/js/productos.js`:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar, cantLegible } from './ui.js';
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar, cantLegible } from './ui.js';
import { activarEscaner } from './scanner.js';
```

- [ ] **Step 2: Activar el escáner al montar la vista y manejar el resultado**

Ubicar:

```javascript
export async function vistaProductos(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  await recargar(cont);
}
```

Reemplazar por:

```javascript
export async function vistaProductos(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  await recargar(cont);
  activarEscaner((codigo) => manejarEscaneo(cont, codigo));
}

async function manejarEscaneo(cont, codigo) {
  let producto = null;
  try { producto = await API.get('/api/productos/codigo/' + encodeURIComponent(codigo)); }
  catch (e) { producto = null; }
  if (producto) abrirActualizacionRapida(cont, producto);
  else abrirForm(cont, null, codigo);
}
```

- [ ] **Step 3: Agregar el modal de actualización rápida**

Al final del archivo `public/js/productos.js`, agregar:

```javascript
function abrirActualizacionRapida(cont, p) {
  const inPU = p.vende_unidad ? input({ type: 'number', step: '1', value: p.precio_unidad, inputmode: 'decimal' }) : null;
  const inPD = p.vende_docena ? input({ type: 'number', step: '1', value: p.precio_docena, inputmode: 'decimal' }) : null;
  const inPK = p.vende_kg ? input({ type: 'number', step: '1', value: p.precio_kg, inputmode: 'decimal' }) : null;
  const esReventa = p.tipo === 'reventa';
  const inCant = esReventa ? input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' }) : null;
  const inCosto = esReventa ? input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' }) : null;

  const campos = [];
  if (inPU) campos.push(campo('Precio por unidad', inPU));
  if (inPD) campos.push(campo('Precio por docena', inPD));
  if (inPK) campos.push(campo('Precio por kilo', inPK));
  if (esReventa) {
    campos.push(el('h3', { text: 'Recibí mercadería (opcional)', style: { marginTop: '8px' } }));
    campos.push(el('div', { class: 'campos-2' }, [campo('Cantidad recibida', inCant), campo('Costo total', inCosto)]));
  }

  async function guardar() {
    try {
      const payloadPrecio = {};
      if (inPU) payloadPrecio.precio_unidad = parseFloat(inPU.value) || 0;
      if (inPD) payloadPrecio.precio_docena = parseFloat(inPD.value) || 0;
      if (inPK) payloadPrecio.precio_kg = parseFloat(inPK.value) || 0;
      if (Object.keys(payloadPrecio).length) await API.put('/api/productos/' + p.id, payloadPrecio);

      const cant = inCant ? parseFloat(inCant.value) || 0 : 0;
      const costo = inCosto ? parseFloat(inCosto.value) || 0 : 0;
      if (cant > 0) await API.post('/api/productos/' + p.id + '/recepcion', { cantidad: cant, costo_total: costo });

      cerrarModal();
      toast(`"${p.nombre}" actualizado`, 'ok');
      recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({
    title: p.nombre,
    body: el('div', {}, campos),
    actions: [
      el('button', { class: 'btn btn-fantasma', text: 'Cerrar', onClick: cerrarModal }),
      el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
    ]
  });
}
```

- [ ] **Step 4: Verificar en el navegador**

```bash
cd /root/fabrica-pastas
npm start &
sleep 1
```

En Productos, crear un producto elaborado (por ejemplo "Ñoquis de prueba", vende por kilo, precio $3000) y anotar el código generado (editarlo y ver el campo Código de barras, ej. `PP-000008`). Volver a la lista y, sin hacer click en nada, escribir ese código con el teclado y apretar Enter: debe aparecer el cartel rápido con el campo "Precio por kilo" precargado en 3000. Cambiar a 3200, Guardar: confirmar el toast "actualizado" y que la lista ahora muestra el precio nuevo. Escribir un código que no existe (ej. `NOEXISTE999`) y Enter: debe abrirse el formulario de "Nuevo producto" con ese código precargado en el campo "Código de barras". Cancelar. Crear un producto de reventa con código `7790000000001`, precio $1000, tipo reventa. Escanear ese código: el cartel rápido debe mostrar también "Recibí mercadería" con cantidad y costo total; cargar cantidad 10 y costo 8000, Guardar; verificar en Stock (o en la fila del producto) que el stock subió a 10.

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
cd /root/fabrica-pastas
git add public/js/productos.js
git commit -m "Agregar flujo de escaneo en Productos: alta rapida y actualizacion de precio/recepcion"
```

---

### Task 7: Escaneo en Vender — agregar producto al carrito

**Files:**
- Modify: `public/js/vender.js`

**Interfaces:**
- Consumes: `activarEscaner` de Task 4, `GET /api/productos/codigo/:codigo` de Task 2, `abrirAgregar(p, main)` ya existente en el archivo.

- [ ] **Step 1: Importar `activarEscaner`**

Ubicar en `public/js/vender.js`:

```javascript
import API from './api.js';
import { el, clear, money, numAR, modal, cerrarModal, toast, colorCategoria } from './ui.js';
```

Reemplazar por:

```javascript
import API from './api.js';
import { el, clear, money, numAR, modal, cerrarModal, toast, colorCategoria } from './ui.js';
import { activarEscaner } from './scanner.js';
```

- [ ] **Step 2: Activar el escáner al montar la vista**

Ubicar:

```javascript
export async function vistaVender(main) {
  productos = await API.get('/api/productos');
  carrito = [];
  render(main);
}
```

Reemplazar por:

```javascript
export async function vistaVender(main) {
  productos = await API.get('/api/productos');
  carrito = [];
  render(main);
  activarEscaner((codigo) => manejarEscaneo(main, codigo));
}

async function manejarEscaneo(main, codigo) {
  let p = null;
  try { p = await API.get('/api/productos/codigo/' + encodeURIComponent(codigo)); }
  catch (e) { p = null; }
  if (!p) { toast('No hay ningún producto con ese código', 'error'); return; }
  abrirAgregar(p, main);
}
```

- [ ] **Step 3: Verificar en el navegador**

```bash
cd /root/fabrica-pastas
npm start &
sleep 1
```

En Vender, sin tocar ninguna ficha, escribir con el teclado el código de un producto que vende por unidad (ej. `PP-000001` si corresponde a los sorrentinos) y Enter: como vende en más de un modo, debe abrirse "¿Cómo lo vendés?"; elegir "Unidad", cargar cantidad y "Agregar": confirmar que aparece en el ticket. Escanear el código de un producto por kilo: debe saltar directo al teclado numérico de peso (sin pasar por el selector de modo, salvo que ese producto también venda de otra forma). Escanear un código inexistente: debe aparecer el toast "No hay ningún producto con ese código" sin romper nada. Con el ticket con ítems cargados, abrir el modal de "Cobrar" y, mientras está abierto, escribir un código y Enter: no debe pasar nada (el escaneo se ignora con el modal abierto); cerrar el modal y confirmar que el escaneo vuelve a funcionar.

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /root/fabrica-pastas
git add public/js/vender.js
git commit -m "Agregar escaneo de codigo de barras en Vender"
```

---

### Task 8: Ver e imprimir etiquetas

**Files:**
- Modify: `public/js/productos.js`

**Interfaces:**
- Consumes: `GET /api/productos/:id/etiqueta.png` de Task 3.

- [ ] **Step 1: Agregar el botón de etiqueta/generar código en la fila de la tabla**

Ubicar en `public/js/productos.js`, dentro de `pintar()`:

```javascript
      el('td', {}, [
        el('button', { class: 'btn btn-chico btn-fantasma', text: 'Editar', onClick: () => abrirForm(cont, p) }),
        el('button', { class: 'btn btn-chico btn-rojo', text: 'Quitar', style: { marginLeft: '8px' }, onClick: async () => {
          if (await confirmar(`¿Quitar "${p.nombre}"?`, { textoOk: 'Quitar', peligro: true })) {
            await API.del('/api/productos/' + p.id); toast('Producto quitado', 'ok'); recargar(cont);
          }
        } })
      ])
```

Reemplazar por:

```javascript
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
```

- [ ] **Step 2: Agregar las funciones de modal e impresión**

Al final de `public/js/productos.js`, agregar:

```javascript
function abrirEtiqueta(p) {
  const inCant = input({ type: 'number', value: 10, min: 1, step: '1', inputmode: 'numeric' });
  const img = el('img', { src: '/api/productos/' + p.id + '/etiqueta.png', style: { display: 'block', margin: '0 auto 14px', maxWidth: '260px' } });
  modal({
    title: 'Etiqueta — ' + p.nombre,
    body: el('div', {}, [
      img,
      campo('Cantidad de etiquetas a imprimir', inCant)
    ]),
    actions: [
      el('button', { class: 'btn btn-fantasma', text: 'Cerrar', onClick: cerrarModal }),
      el('button', { class: 'btn btn-primario', text: 'Imprimir hoja', onClick: () => imprimirHoja(p, parseInt(inCant.value, 10) || 1) })
    ]
  });
}

function imprimirHoja(p, cantidad) {
  const win = window.open('', '_blank');
  const etiquetas = Array.from({ length: cantidad }, () => `
    <div class="etq">
      <div class="etq-nombre">${p.nombre}</div>
      <img src="/api/productos/${p.id}/etiqueta.png">
    </div>
  `).join('');
  win.document.write(`
    <!DOCTYPE html>
    <html><head><title>Etiquetas — ${p.nombre}</title>
    <style>
      body{ font-family: sans-serif; }
      .hoja{ display:flex; flex-wrap:wrap; gap:6mm; }
      .etq{ width:45mm; border:1px dashed #999; padding:3mm; text-align:center; page-break-inside:avoid; }
      .etq-nombre{ font-weight:700; font-size:11px; margin-bottom:2mm; }
      .etq img{ width:100%; }
    </style>
    </head><body><div class="hoja">${etiquetas}</div></body></html>
  `);
  win.document.close();
  win.onload = () => win.print();
}
```

- [ ] **Step 3: Verificar en el navegador**

```bash
cd /root/fabrica-pastas
npm start &
sleep 1
```

En Productos, un producto sin código de barras debe mostrar el botón "Generar código"; hacer click y confirmar que ahora dice "Etiqueta". Hacer click en "Etiqueta": debe abrirse un modal con la imagen del código de barras visible y legible, y un campo de cantidad (10 por defecto). Cambiar a 3 y hacer click en "Imprimir hoja": debe abrirse una pestaña/ventana nueva con 3 copias de la etiqueta en una grilla, y el diálogo de impresión del navegador debe aparecer automáticamente. Cancelar la impresión y cerrar esa pestaña. Confirmar que la etiqueta impresa (o la vista previa de impresión) muestra un código de barras nítido, no pixelado ni cortado.

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
cd /root/fabrica-pastas
git add public/js/productos.js
git commit -m "Agregar vista e impresion de etiquetas con codigo de barras"
```

---

### Task 9: Verificación end-to-end y prueba con lector físico

**Files:**
- Ninguno (solo verificación; no hay suite de tests automatizados en este proyecto).

**Interfaces:**
- Consumes: todo lo construido en las Tasks 1 a 8, corriendo junto como un sistema.

- [ ] **Step 1: Levantar el servidor con la base de datos real**

```bash
cd /root/fabrica-pastas
npm start
```

- [ ] **Step 2: Flujo completo en Productos**

- Crear un producto elaborado nuevo por escaneo: escribir un código que no exista y Enter → se abre "Nuevo producto" con el código precargado → completar y guardar.
- Escanear ese mismo código de nuevo → debe abrir el cartel de actualización rápida (ya no "nuevo").
- Crear un producto de reventa, imprimir su etiqueta (hoja con al menos 2 copias), y **si ya hay un lector físico USB/Bluetooth conectado**, escanear la etiqueta impresa directamente: debe abrir el cartel de actualización rápida para ese producto exacto. Si todavía no hay lector físico disponible, dejar esta verificación pendiente para cuando llegue el hardware, y mientras tanto validar solo con el teclado (como en los pasos anteriores).

- [ ] **Step 3: Flujo completo en Vender con un producto por peso**

- Elegir un producto elaborado que se venda por kilo (ej. Ñoquis). Anotar su código.
- En Vender, escanear (o tipear) ese código: debe saltar directo al teclado de peso.
- Pesar en la balanza común un valor de prueba (ej. 850 g), cargar `0.850` en el teclado, Agregar.
- Confirmar que el ticket muestra el importe correcto (peso × precio por kilo).
- Cobrar la venta y confirmar que se descuenta el stock correctamente (como ya funcionaba antes de este cambio).

- [ ] **Step 4: Confirmar que el resto del sistema sigue igual**

- Ir a Caja, Stock, Gastos, Costos y Ajustes: confirmar que cargan sin errores y que escanear un código estando en esas pantallas no hace nada (el escáner solo está activo en Productos y Vender).
- Revisar la pantalla de Costos/Reportes: los productos de reventa ahora deben aparecer con margen calculado desde `costo_compra`, no en blanco.

- [ ] **Step 5: Decidir sobre el despliegue a producción**

Este trabajo se hizo sobre `/root/fabrica-pastas`, que ya corre en producción bajo PM2 (proceso `fabrica`). Una vez verificado localmente, para llevarlo a producción:

```bash
sudo pm2 restart fabrica
sudo pm2 logs fabrica --lines 50
```

Confirmar en los logs que arrancó sin errores (en particular, que `bwip-js` se resolvió bien) y que `D.driver` sigue mostrando `better-sqlite3`. Verificar en `https://elsastredelapasta.com` (con una cuenta de prueba, no en medio de una venta real) que Productos y Vender funcionan como en local antes de dar por cerrado el trabajo.
