'use strict';
/*
 * API REST + servidor de archivos estáticos.
 * Todo el negocio queda detrás de /api para poder enchufar después
 * WhatsApp, generador de imágenes u otras apps sin tocar el frontend.
 */

const express = require('express');
const path = require('path');
const D = require('./db');
const { db } = D;
const bwipjs = require('bwip-js');

const app = express();
app.use(express.json());

// Sucursal por defecto si no se aclara (multi-sucursal listo a futuro)
function suc(req) {
  const s = parseInt(req.query.sucursal_id || req.body?.sucursal_id || '1', 10);
  return Number.isFinite(s) ? s : 1;
}
const num = (v, def = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};
const bool01 = (v) => (v ? 1 : 0);
const lastId = (r) => Number(r.lastInsertRowid);

// Envoltorio para que un error tire JSON claro en español
const h = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Ocurrió un error' });
  }
};

// =====================================================================
// AUTENTICACIÓN  (login/logout/me + guardia para todo /api)
// =====================================================================
const auth = require('./auth');
const { requireAuth, requireAdmin } = auth.montar(app); // registra /api/login, /api/logout, /api/me
app.use('/api', requireAuth); // de acá para abajo, todo /api pide sesión

// Gestión de usuarios (solo admin)
app.get('/api/usuarios', requireAdmin, h((req, res) => res.json(D.listarUsuarios())));
app.post('/api/usuarios', requireAdmin, h((req, res) => {
  const id = D.crearUsuario(req.body.nombre, req.body.usuario, req.body.contraseña || req.body.contrasena, req.body.rol);
  res.json(D.getUsuario(id));
}));
app.put('/api/usuarios/:id/password', requireAdmin, h((req, res) => {
  D.cambiarPassword(+req.params.id, req.body.contraseña || req.body.contrasena);
  res.json({ ok: true });
}));
app.delete('/api/usuarios/:id', requireAdmin, h((req, res) => {
  if (+req.params.id === req.usuario.id) throw new Error('No podés desactivar tu propio usuario');
  db.prepare('UPDATE usuario SET activo = 0 WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
}));

// =====================================================================
// CONFIG / AJUSTES
// =====================================================================
app.get('/api/config', h((req, res) => {
  const rows = db.prepare('SELECT clave, valor FROM config').all();
  const out = {};
  for (const r of rows) out[r.clave] = r.valor;
  out._driver = D.driver;
  res.json(out);
}));

app.put('/api/config', h((req, res) => {
  const permitidas = ['nombre_negocio', 'costo_hora', 'saldo_inicial_caja', 'moneda'];
  for (const k of permitidas) {
    if (req.body[k] !== undefined) D.setConfig(k, req.body[k]);
  }
  res.json({ ok: true });
}));

// =====================================================================
// SUCURSALES
// =====================================================================
app.get('/api/sucursales', h((req, res) => {
  res.json(db.prepare('SELECT * FROM sucursal WHERE activa = 1 ORDER BY id').all());
}));
app.post('/api/sucursales', h((req, res) => {
  const nombre = (req.body.nombre || '').trim();
  if (!nombre) throw new Error('Falta el nombre de la sucursal');
  const r = db.prepare('INSERT INTO sucursal (nombre) VALUES (?)').run(nombre);
  res.json({ id: lastId(r), nombre });
}));

// =====================================================================
// INGREDIENTES
// =====================================================================
app.get('/api/ingredientes', h((req, res) => {
  res.json(db.prepare(
    'SELECT * FROM ingrediente WHERE sucursal_id = ? AND activo = 1 ORDER BY nombre'
  ).all(suc(req)));
}));

app.post('/api/ingredientes', h((req, res) => {
  const { nombre, unidad_base } = req.body;
  if (!nombre || !nombre.trim()) throw new Error('Falta el nombre del ingrediente');
  const u = ['kg', 'l', 'unidad'].includes(unidad_base) ? unidad_base : 'kg';
  const r = db.prepare(
    'INSERT INTO ingrediente (sucursal_id, nombre, unidad_base, stock, costo_unidad_base) VALUES (?,?,?,?,?)'
  ).run(suc(req), nombre.trim(), u, num(req.body.stock), num(req.body.costo_unidad_base));
  res.json(db.prepare('SELECT * FROM ingrediente WHERE id = ?').get(lastId(r)));
}));

app.put('/api/ingredientes/:id', h((req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM ingrediente WHERE id = ?').get(id);
  if (!cur) throw new Error('Ingrediente no encontrado');
  const nombre = req.body.nombre != null ? String(req.body.nombre).trim() : cur.nombre;
  const unidad_base = ['kg', 'l', 'unidad'].includes(req.body.unidad_base) ? req.body.unidad_base : cur.unidad_base;
  const stock = req.body.stock != null ? num(req.body.stock) : cur.stock;
  const costo = req.body.costo_unidad_base != null ? num(req.body.costo_unidad_base) : cur.costo_unidad_base;
  db.prepare('UPDATE ingrediente SET nombre=?, unidad_base=?, stock=?, costo_unidad_base=? WHERE id=?')
    .run(nombre, unidad_base, stock, costo, id);
  res.json(db.prepare('SELECT * FROM ingrediente WHERE id = ?').get(id));
}));

app.delete('/api/ingredientes/:id', h((req, res) => {
  db.prepare('UPDATE ingrediente SET activo = 0 WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
}));

// =====================================================================
// COMPRAS  (suben stock y fijan el último precio del ingrediente)
// =====================================================================
app.get('/api/compras', h((req, res) => {
  res.json(db.prepare(`
    SELECT c.*, i.nombre AS ingrediente, i.unidad_base
    FROM compra c JOIN ingrediente i ON i.id = c.ingrediente_id
    WHERE c.sucursal_id = ? ORDER BY c.fecha DESC LIMIT 200
  `).all(suc(req)));
}));

app.post('/api/compras', h((req, res) => {
  const ing = db.prepare('SELECT * FROM ingrediente WHERE id = ?').get(+req.body.ingrediente_id);
  if (!ing) throw new Error('Elegí un ingrediente válido');
  const cantidad = num(req.body.cantidad_base);
  const costo = num(req.body.costo_total);
  if (cantidad <= 0) throw new Error('La cantidad comprada debe ser mayor a 0');
  if (costo < 0) throw new Error('El costo no puede ser negativo');
  const fecha = req.body.fecha || D.ahoraAR();
  const pagado = req.body.pagado_con || 'efectivo';

  const r = db.prepare(
    'INSERT INTO compra (sucursal_id, ingrediente_id, fecha, cantidad_base, costo_total, pagado_con) VALUES (?,?,?,?,?,?)'
  ).run(suc(req), ing.id, fecha, cantidad, costo, pagado);

  // Stock sube; costo del ingrediente = último precio pagado
  const nuevoCostoUnidad = cantidad > 0 ? costo / cantidad : ing.costo_unidad_base;
  db.prepare('UPDATE ingrediente SET stock = stock + ?, costo_unidad_base = ? WHERE id = ?')
    .run(cantidad, D.round2(nuevoCostoUnidad), ing.id);

  res.json({ id: lastId(r), costo_unidad_base: D.round2(nuevoCostoUnidad) });
}));

// =====================================================================
// PRODUCTOS  (con costo y margen calculados)
// =====================================================================
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
  if (p.vende_unidad && p.precio_unidad > 0) { precioRef = p.precio_unidad; baseRef = 'unidad'; }
  else if (p.vende_kg && p.precio_kg > 0) { precioRef = p.precio_kg; baseRef = 'kg'; }
  else if (p.vende_docena && p.precio_docena > 0) { precioRef = p.precio_docena / 12; baseRef = 'unidad (desde docena)'; }
  const margen = precioRef - costo;
  return {
    ...p,
    costo_unitario: costo,
    costo_detalle: c,
    precio_referencia: D.round2(precioRef),
    base_referencia: baseRef,
    margen_unitario: D.round2(margen),
    margen_pct: precioRef > 0 ? D.round2((margen / precioRef) * 100) : null
  };
}

app.get('/api/productos', h((req, res) => {
  const incluirInactivos = req.query.todos === '1';
  const rows = db.prepare(
    `SELECT * FROM producto WHERE sucursal_id = ? ${incluirInactivos ? '' : 'AND activo = 1'} ORDER BY categoria, nombre`
  ).all(suc(req));
  const ohPorMin = D.overheadPorMinuto();
  const costoHora = D.getConfigNum('costo_hora', 0);
  res.json(rows.map((p) => productoConCosto(p, ohPorMin, costoHora)));
}));

app.get('/api/productos/:id', h((req, res) => {
  const p = db.prepare('SELECT * FROM producto WHERE id = ?').get(+req.params.id);
  if (!p) throw new Error('Producto no encontrado');
  const receta = db.prepare(`
    SELECT ri.id, ri.ingrediente_id, ri.cantidad_base, i.nombre, i.unidad_base, i.costo_unidad_base
    FROM receta_item ri JOIN ingrediente i ON i.id = ri.ingrediente_id
    WHERE ri.producto_id = ? ORDER BY i.nombre
  `).all(p.id);
  const full = productoConCosto(p, D.overheadPorMinuto(), D.getConfigNum('costo_hora', 0));
  full.receta = receta;
  res.json(full);
}));

function leerProductoBody(b, cur = {}) {
  return {
    nombre: (b.nombre != null ? String(b.nombre) : cur.nombre || '').trim(),
    categoria: (b.categoria != null ? String(b.categoria) : cur.categoria || 'General').trim() || 'General',
    unidad_stock: ['unidad', 'kg'].includes(b.unidad_stock) ? b.unidad_stock : (cur.unidad_stock || 'unidad'),
    tipo: ['elaborado', 'reventa'].includes(b.tipo) ? b.tipo : (cur.tipo || 'elaborado'),
    codigo_barra: b.codigo_barra != null ? (String(b.codigo_barra).trim() || null) : (cur.codigo_barra ?? null),
    minutos_mano_obra: b.minutos_mano_obra != null ? num(b.minutos_mano_obra) : (cur.minutos_mano_obra || 0),
    precio_unidad: b.precio_unidad != null ? num(b.precio_unidad) : (cur.precio_unidad || 0),
    precio_docena: b.precio_docena != null ? num(b.precio_docena) : (cur.precio_docena || 0),
    precio_kg: b.precio_kg != null ? num(b.precio_kg) : (cur.precio_kg || 0),
    vende_unidad: b.vende_unidad != null ? bool01(b.vende_unidad) : (cur.vende_unidad ?? 1),
    vende_docena: b.vende_docena != null ? bool01(b.vende_docena) : (cur.vende_docena ?? 0),
    vende_kg: b.vende_kg != null ? bool01(b.vende_kg) : (cur.vende_kg ?? 0),
    vende_monto: b.vende_monto != null ? bool01(b.vende_monto) : (cur.vende_monto ?? 1)
  };
}

function chequearCodigoUnico(codigo, sucursalId, excluirId) {
  if (!codigo) return;
  const fila = db.prepare(
    'SELECT id, nombre FROM producto WHERE codigo_barra = ? AND sucursal_id = ? AND id != ?'
  ).get(codigo, sucursalId, excluirId || 0);
  if (fila) throw new Error(`Ese código ya está asignado a "${fila.nombre}"`);
}

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

app.delete('/api/productos/:id', h((req, res) => {
  db.prepare('UPDATE producto SET activo = 0 WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
}));

function guardarReceta(productoId, items) {
  db.prepare('DELETE FROM receta_item WHERE producto_id = ?').run(productoId);
  const ins = db.prepare('INSERT INTO receta_item (producto_id, ingrediente_id, cantidad_base) VALUES (?,?,?)');
  for (const it of items) {
    const ingId = +it.ingrediente_id;
    const cant = num(it.cantidad_base);
    if (ingId && cant > 0) ins.run(productoId, ingId, cant);
  }
}

app.put('/api/productos/:id/receta', h((req, res) => {
  const id = +req.params.id;
  if (!db.prepare('SELECT 1 FROM producto WHERE id = ?').get(id)) throw new Error('Producto no encontrado');
  guardarReceta(id, Array.isArray(req.body.items) ? req.body.items : []);
  res.json({ ok: true });
}));

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

// =====================================================================
// PRODUCCIÓN  (consume ingredientes, suma stock de producto, registra mano de obra)
// =====================================================================
app.get('/api/produccion', h((req, res) => {
  res.json(db.prepare(`
    SELECT pr.*, p.nombre AS producto, p.unidad_stock
    FROM produccion pr JOIN producto p ON p.id = pr.producto_id
    WHERE pr.sucursal_id = ? ORDER BY pr.fecha DESC LIMIT 200
  `).all(suc(req)));
}));

app.post('/api/produccion', h((req, res) => {
  const prod = db.prepare('SELECT * FROM producto WHERE id = ?').get(+req.body.producto_id);
  if (!prod) throw new Error('Elegí un producto válido');
  const cantidad = num(req.body.cantidad);
  if (cantidad <= 0) throw new Error('La cantidad producida debe ser mayor a 0');
  const minutos = req.body.minutos != null ? num(req.body.minutos) : (prod.minutos_mano_obra * cantidad);
  const empleado = (req.body.empleado || '').trim();
  const fecha = req.body.fecha || D.ahoraAR();

  const receta = db.prepare(`
    SELECT ri.ingrediente_id, ri.cantidad_base, i.nombre, i.stock
    FROM receta_item ri JOIN ingrediente i ON i.id = ri.ingrediente_id
    WHERE ri.producto_id = ?
  `).all(prod.id);

  // Aviso (no bloquea) si algún ingrediente queda en negativo
  const faltantes = [];
  for (const r of receta) {
    const necesita = r.cantidad_base * cantidad;
    if (r.stock < necesita) faltantes.push({ nombre: r.nombre, falta: D.round2(necesita - r.stock) });
  }

  const tx = () => {
    const ins = db.prepare(
      'INSERT INTO produccion (sucursal_id, producto_id, fecha, cantidad, empleado, minutos) VALUES (?,?,?,?,?,?)'
    ).run(suc(req), prod.id, fecha, cantidad, empleado, minutos);
    for (const r of receta) {
      db.prepare('UPDATE ingrediente SET stock = stock - ? WHERE id = ?')
        .run(r.cantidad_base * cantidad, r.ingrediente_id);
    }
    db.prepare('UPDATE producto SET stock = stock + ? WHERE id = ?').run(cantidad, prod.id);
    return Number(ins.lastInsertRowid);
  };
  db.exec('BEGIN');
  let nuevoId;
  try { nuevoId = tx(); db.exec('COMMIT'); }
  catch (e) { db.exec('ROLLBACK'); throw e; }

  res.json({ id: nuevoId, minutos, faltantes });
}));

// =====================================================================
// GASTOS
// =====================================================================
app.get('/api/gastos', h((req, res) => {
  const desde = req.query.desde, hasta = req.query.hasta;
  let sql = 'SELECT * FROM gasto WHERE sucursal_id = ?';
  const args = [suc(req)];
  if (desde) { sql += ' AND fecha >= ?'; args.push(desde); }
  if (hasta) { sql += ' AND fecha <= ?'; args.push(hasta + ' 23:59:59'); }
  sql += ' ORDER BY fecha DESC LIMIT 300';
  res.json(db.prepare(sql).all(...args));
}));

app.post('/api/gastos', h((req, res) => {
  const importe = num(req.body.importe);
  if (importe <= 0) throw new Error('El importe del gasto debe ser mayor a 0');
  const categoria = (req.body.categoria || 'otros').trim();
  const descripcion = (req.body.descripcion || '').trim();
  const pagado = req.body.pagado_con || 'efectivo';
  const fecha = req.body.fecha || D.ahoraAR();
  const r = db.prepare(
    'INSERT INTO gasto (sucursal_id, fecha, categoria, descripcion, importe, pagado_con) VALUES (?,?,?,?,?,?)'
  ).run(suc(req), fecha, categoria, descripcion, importe, pagado);
  res.json({ id: lastId(r) });
}));

app.delete('/api/gastos/:id', h((req, res) => {
  db.prepare('DELETE FROM gasto WHERE id = ?').run(+req.params.id);
  res.json({ ok: true });
}));

// =====================================================================
// VENTAS  (POS): calcula importes, descuenta stock, guarda
// =====================================================================
function calcularItem(prod, modo, cantidad, importeManual) {
  let cant = num(cantidad);
  let importe = 0;
  let unidadesStock = 0; // cuánto descontar del stock del producto

  if (modo === 'unidad') {
    importe = cant * prod.precio_unidad;
    unidadesStock = cant;
  } else if (modo === 'docena') {
    importe = prod.precio_docena > 0 ? cant * prod.precio_docena : cant * 12 * prod.precio_unidad;
    unidadesStock = cant * 12;
  } else if (modo === 'kg') {
    importe = cant * prod.precio_kg;
    unidadesStock = cant; // stock en kg
  } else if (modo === 'monto') {
    importe = num(importeManual);
    cant = 0;
    // estimación de cuánto se llevó, para descontar stock
    if (prod.unidad_stock === 'kg' && prod.precio_kg > 0) unidadesStock = importe / prod.precio_kg;
    else if (prod.precio_unidad > 0) unidadesStock = importe / prod.precio_unidad;
    else unidadesStock = 0;
  } else {
    throw new Error('Forma de venta no válida: ' + modo);
  }
  if (importe <= 0) throw new Error(`Revisá el precio/cantidad de "${prod.nombre}"`);
  return { cantidad: cant, importe: D.round2(importe), unidadesStock };
}

app.post('/api/ventas', h((req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) throw new Error('La venta no tiene productos');
  const medio = req.body.medio_pago || 'efectivo';
  const fecha = req.body.fecha || D.ahoraAR();

  const preparados = items.map((it) => {
    const prod = db.prepare('SELECT * FROM producto WHERE id = ?').get(+it.producto_id);
    if (!prod) throw new Error('Producto inexistente en la venta');
    const calc = calcularItem(prod, it.modo, it.cantidad, it.importe);
    return { prod, modo: it.modo, ...calc };
  });
  const total = D.round2(preparados.reduce((a, p) => a + p.importe, 0));

  db.exec('BEGIN');
  let ventaId;
  try {
    const v = db.prepare('INSERT INTO venta (sucursal_id, fecha, total, medio_pago) VALUES (?,?,?,?)')
      .run(suc(req), fecha, total, medio);
    ventaId = Number(v.lastInsertRowid);
    const insItem = db.prepare(
      'INSERT INTO venta_item (venta_id, producto_id, nombre_producto, modo, cantidad, importe) VALUES (?,?,?,?,?,?)'
    );
    for (const p of preparados) {
      insItem.run(ventaId, p.prod.id, p.prod.nombre, p.modo, p.cantidad, p.importe);
      db.prepare('UPDATE producto SET stock = stock - ? WHERE id = ?').run(p.unidadesStock, p.prod.id);
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  res.json({ id: ventaId, total, fecha, medio_pago: medio });
}));

app.get('/api/ventas', h((req, res) => {
  const desde = req.query.desde || D.hoyAR();
  const hasta = req.query.hasta || D.hoyAR();
  const ventas = db.prepare(
    'SELECT * FROM venta WHERE sucursal_id = ? AND fecha >= ? AND fecha <= ? ORDER BY fecha DESC'
  ).all(suc(req), desde, hasta + ' 23:59:59');
  const itemsStmt = db.prepare('SELECT * FROM venta_item WHERE venta_id = ?');
  for (const v of ventas) v.items = itemsStmt.all(v.id);
  res.json(ventas);
}));

app.delete('/api/ventas/:id', h((req, res) => {
  // Anula la venta y repone el stock
  const id = +req.params.id;
  const v = db.prepare('SELECT * FROM venta WHERE id = ?').get(id);
  if (!v) throw new Error('Venta no encontrada');
  const items = db.prepare('SELECT * FROM venta_item WHERE venta_id = ?').all(id);
  db.exec('BEGIN');
  try {
    for (const it of items) {
      const prod = db.prepare('SELECT * FROM producto WHERE id = ?').get(it.producto_id);
      if (!prod) continue;
      let unidades = 0;
      if (it.modo === 'unidad') unidades = it.cantidad;
      else if (it.modo === 'docena') unidades = it.cantidad * 12;
      else if (it.modo === 'kg') unidades = it.cantidad;
      else if (it.modo === 'monto') {
        if (prod.unidad_stock === 'kg' && prod.precio_kg > 0) unidades = it.importe / prod.precio_kg;
        else if (prod.precio_unidad > 0) unidades = it.importe / prod.precio_unidad;
      }
      db.prepare('UPDATE producto SET stock = stock + ? WHERE id = ?').run(unidades, prod.id);
    }
    db.prepare('DELETE FROM venta WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  res.json({ ok: true });
}));

// =====================================================================
// CAJA  (¿cuánta plata debería tener?)
// =====================================================================
app.get('/api/caja', h((req, res) => {
  const desde = req.query.desde || D.hoyAR();
  const hasta = req.query.hasta || D.hoyAR();
  const s = suc(req);
  const h2 = hasta + ' 23:59:59';

  const porMedio = db.prepare(`
    SELECT medio_pago, COALESCE(SUM(total),0) total, COUNT(*) cant
    FROM venta WHERE sucursal_id=? AND fecha>=? AND fecha<=? GROUP BY medio_pago
  `).all(s, desde, h2);

  const totalVentas = porMedio.reduce((a, m) => a + m.total, 0);
  const ventasEfectivo = porMedio.filter((m) => m.medio_pago === 'efectivo').reduce((a, m) => a + m.total, 0);

  const gastosEfectivo = db.prepare(
    "SELECT COALESCE(SUM(importe),0) s FROM gasto WHERE sucursal_id=? AND pagado_con='efectivo' AND fecha>=? AND fecha<=?"
  ).get(s, desde, h2).s;
  const comprasEfectivo = db.prepare(
    "SELECT COALESCE(SUM(costo_total),0) s FROM compra WHERE sucursal_id=? AND pagado_con='efectivo' AND fecha>=? AND fecha<=?"
  ).get(s, desde, h2).s;

  const saldoInicial = D.getConfigNum('saldo_inicial_caja', 0);
  const cajaEsperada = saldoInicial + ventasEfectivo - gastosEfectivo - comprasEfectivo;

  res.json({
    desde, hasta,
    saldo_inicial: saldoInicial,
    ventas_por_medio: porMedio,
    total_ventas: D.round2(totalVentas),
    cantidad_ventas: porMedio.reduce((a, m) => a + m.cant, 0),
    ventas_efectivo: D.round2(ventasEfectivo),
    gastos_efectivo: D.round2(gastosEfectivo),
    compras_efectivo: D.round2(comprasEfectivo),
    caja_esperada: D.round2(cajaEsperada)
  });
}));

// =====================================================================
// REPORTES
// =====================================================================
function unidadesDeItem(it, prod) {
  if (it.modo === 'unidad') return it.cantidad;
  if (it.modo === 'docena') return it.cantidad * 12;
  if (it.modo === 'kg') return it.cantidad;
  if (it.modo === 'monto') {
    if (prod && prod.unidad_stock === 'kg' && prod.precio_kg > 0) return it.importe / prod.precio_kg;
    if (prod && prod.precio_unidad > 0) return it.importe / prod.precio_unidad;
  }
  return 0;
}

app.get('/api/reportes/resumen', h((req, res) => {
  const desde = req.query.desde || D.hoyAR();
  const hasta = req.query.hasta || D.hoyAR();
  const s = suc(req);
  const h2 = hasta + ' 23:59:59';

  const ventas = db.prepare('SELECT * FROM venta WHERE sucursal_id=? AND fecha>=? AND fecha<=?').all(s, desde, h2);
  const totalVentas = ventas.reduce((a, v) => a + v.total, 0);
  const cant = ventas.length;

  // Top productos + costo estimado de lo vendido
  const items = db.prepare(`
    SELECT vi.* FROM venta_item vi JOIN venta v ON v.id = vi.venta_id
    WHERE v.sucursal_id=? AND v.fecha>=? AND v.fecha<=?
  `).all(s, desde, h2);

  const ohPorMin = D.overheadPorMinuto();
  const costoHora = D.getConfigNum('costo_hora', 0);
  const costoCache = {};
  const prodCache = {};
  const top = {};
  let costoVendido = 0;

  for (const it of items) {
    if (!prodCache[it.producto_id]) prodCache[it.producto_id] = db.prepare('SELECT * FROM producto WHERE id=?').get(it.producto_id);
    const prod = prodCache[it.producto_id];
    if (!costoCache[it.producto_id]) {
      const c = D.costoProducto(it.producto_id, { overheadPorMinuto: ohPorMin, costoHora });
      costoCache[it.producto_id] = c ? c.total : 0;
    }
    const u = unidadesDeItem(it, prod);
    costoVendido += u * costoCache[it.producto_id];

    if (!top[it.producto_id]) top[it.producto_id] = { producto: it.nombre_producto, importe: 0, unidades: 0 };
    top[it.producto_id].importe += it.importe;
    top[it.producto_id].unidades += u;
  }

  const topArr = Object.values(top)
    .map((t) => ({ ...t, importe: D.round2(t.importe), unidades: D.round2(t.unidades) }))
    .sort((a, b) => b.importe - a.importe).slice(0, 10);

  res.json({
    desde, hasta,
    total_ventas: D.round2(totalVentas),
    cantidad_ventas: cant,
    ticket_promedio: cant ? D.round2(totalVentas / cant) : 0,
    costo_estimado_vendido: D.round2(costoVendido),
    ganancia_estimada: D.round2(totalVentas - costoVendido),
    top_productos: topArr
  });
}));

app.get('/api/reportes/costos', h((req, res) => {
  const s = suc(req);
  const rows = db.prepare('SELECT * FROM producto WHERE sucursal_id=? AND activo=1 ORDER BY categoria, nombre').all(s);
  const ohPorMin = D.overheadPorMinuto();
  const costoHora = D.getConfigNum('costo_hora', 0);
  res.json({
    overhead_por_minuto: D.round2(ohPorMin),
    costo_hora: costoHora,
    productos: rows.map((p) => productoConCosto(p, ohPorMin, costoHora))
  });
}));

// =====================================================================
// Frontend estático
// =====================================================================
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Fábrica de Pastas — servidor en http://localhost:${PORT}`);
  console.log(`  Base de datos: ${D.DB_PATH}  (driver: ${D.driver})`);
  if (!D.hayUsuarios()) {
    console.log('\n  ⚠  No hay usuarios todavía. Creá el administrador con:');
    console.log('     node db.js --crear-admin <usuario> <contraseña> "Nombre"\n');
  } else {
    console.log('');
  }
});
