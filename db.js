'use strict';
/*
 * Capa de datos: conexión, esquema y lógica de costeo.
 *
 * Usa better-sqlite3 si está disponible (más rápido). Si no compila
 * (p.ej. sin compilador nativo), cae automáticamente al SQLite nativo
 * de Node (node:sqlite, Node 22+). Así `npm install` nunca se rompe.
 */

const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'fabrica.db');

// ---- Selección de driver -------------------------------------------------
let db;
let driver;
try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  driver = 'better-sqlite3';
} catch (e) {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  driver = 'node:sqlite';
}

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ---- Fechas en hora de Argentina (UTC-3, sin horario de verano) -----------
function ahoraAR() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:MM:SS'
}
function hoyAR() {
  return ahoraAR().slice(0, 10); // 'YYYY-MM-DD'
}
function mesAR() {
  return ahoraAR().slice(0, 7); // 'YYYY-MM'
}

// ---- Esquema -------------------------------------------------------------
function crearEsquema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS sucursal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    activa INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS config (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS ingrediente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    nombre TEXT NOT NULL,
    unidad_base TEXT NOT NULL DEFAULT 'kg',   -- 'kg' | 'l' | 'unidad'
    stock REAL NOT NULL DEFAULT 0,            -- en unidad_base
    costo_unidad_base REAL NOT NULL DEFAULT 0,-- $ por unidad_base (último precio)
    activo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    ingrediente_id INTEGER NOT NULL REFERENCES ingrediente(id),
    fecha TEXT NOT NULL,
    cantidad_base REAL NOT NULL,
    costo_total REAL NOT NULL,
    pagado_con TEXT NOT NULL DEFAULT 'efectivo'
  );

  CREATE TABLE IF NOT EXISTS producto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'General',
    unidad_stock TEXT NOT NULL DEFAULT 'unidad', -- 'unidad' | 'kg'
    stock REAL NOT NULL DEFAULT 0,
    minutos_mano_obra REAL NOT NULL DEFAULT 0,   -- por 1 unidad de stock
    precio_unidad REAL NOT NULL DEFAULT 0,
    precio_docena REAL NOT NULL DEFAULT 0,
    precio_kg REAL NOT NULL DEFAULT 0,
    vende_unidad INTEGER NOT NULL DEFAULT 1,
    vende_docena INTEGER NOT NULL DEFAULT 0,
    vende_kg INTEGER NOT NULL DEFAULT 0,
    vende_monto INTEGER NOT NULL DEFAULT 1,
    activo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS receta_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
    ingrediente_id INTEGER NOT NULL REFERENCES ingrediente(id),
    cantidad_base REAL NOT NULL  -- consumo por 1 unidad de stock del producto
  );

  CREATE TABLE IF NOT EXISTS produccion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    producto_id INTEGER NOT NULL REFERENCES producto(id),
    fecha TEXT NOT NULL,
    cantidad REAL NOT NULL,        -- unidades de stock producidas
    empleado TEXT,
    minutos REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS gasto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    fecha TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'otros',
    descripcion TEXT,
    importe REAL NOT NULL,
    pagado_con TEXT NOT NULL DEFAULT 'efectivo'
  );

  CREATE TABLE IF NOT EXISTS venta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL DEFAULT 1,
    fecha TEXT NOT NULL,
    total REAL NOT NULL,
    medio_pago TEXT NOT NULL DEFAULT 'efectivo'
  );

  CREATE TABLE IF NOT EXISTS venta_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
    producto_id INTEGER NOT NULL REFERENCES producto(id),
    nombre_producto TEXT NOT NULL,
    modo TEXT NOT NULL,            -- 'unidad' | 'docena' | 'kg' | 'monto'
    cantidad REAL NOT NULL DEFAULT 0,
    importe REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usuario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'operador',  -- 'admin' | 'operador'
    activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_venta_fecha ON venta(fecha);
  CREATE INDEX IF NOT EXISTS idx_gasto_fecha ON gasto(fecha);
  CREATE INDEX IF NOT EXISTS idx_prod_fecha ON produccion(fecha);
  CREATE INDEX IF NOT EXISTS idx_receta_prod ON receta_item(producto_id);
  CREATE INDEX IF NOT EXISTS idx_vitem_venta ON venta_item(venta_id);
  `);

  // Semillas mínimas siempre presentes
  const haySuc = db.prepare('SELECT COUNT(*) c FROM sucursal').get().c;
  if (!haySuc) db.prepare('INSERT INTO sucursal (id, nombre) VALUES (1, ?)').run('Casa Central');

  const defaults = {
    nombre_negocio: 'Fábrica de Pastas',
    costo_hora: '3000',          // $ por hora de mano de obra
    saldo_inicial_caja: '0',     // efectivo con el que arranca la caja del día
    moneda: '$'
  };
  for (const [k, v] of Object.entries(defaults)) {
    db.prepare('INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)').run(k, v);
  }
}

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

// ---- Helpers de config ---------------------------------------------------
function getConfig(clave) {
  const r = db.prepare('SELECT valor FROM config WHERE clave = ?').get(clave);
  return r ? r.valor : null;
}
function getConfigNum(clave, def = 0) {
  const v = parseFloat(getConfig(clave));
  return Number.isFinite(v) ? v : def;
}
function setConfig(clave, valor) {
  db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run(clave, String(valor));
}

// ---- Costeo --------------------------------------------------------------
// Costo indirecto (gastos) por minuto de producción, para un mes 'YYYY-MM'.
function overheadPorMinuto(mes = mesAR(), sucursalId = 1) {
  const g = db.prepare(
    "SELECT COALESCE(SUM(importe),0) s FROM gasto WHERE substr(fecha,1,7)=? AND sucursal_id=?"
  ).get(mes, sucursalId).s;
  const m = db.prepare(
    "SELECT COALESCE(SUM(minutos),0) s FROM produccion WHERE substr(fecha,1,7)=? AND sucursal_id=?"
  ).get(mes, sucursalId).s;
  return m > 0 ? g / m : 0;
}

// Costo unitario (por 1 unidad de stock) de un producto, desglosado.
function costoProducto(productoId, opts = {}) {
  const p = db.prepare('SELECT * FROM producto WHERE id = ?').get(productoId);
  if (!p) return null;
  const costoHora = opts.costoHora != null ? opts.costoHora : getConfigNum('costo_hora', 0);
  const ohPorMin = opts.overheadPorMinuto != null ? opts.overheadPorMinuto : overheadPorMinuto();

  const items = db.prepare(`
    SELECT ri.cantidad_base, i.costo_unidad_base, i.nombre, i.unidad_base
    FROM receta_item ri JOIN ingrediente i ON i.id = ri.ingrediente_id
    WHERE ri.producto_id = ?
  `).all(productoId);

  let material = 0;
  const detalle = items.map((it) => {
    const sub = it.cantidad_base * it.costo_unidad_base;
    material += sub;
    return {
      nombre: it.nombre,
      cantidad_base: it.cantidad_base,
      unidad_base: it.unidad_base,
      costo_unidad_base: it.costo_unidad_base,
      subtotal: round2(sub)
    };
  });

  const manoObra = (p.minutos_mano_obra || 0) * (costoHora / 60);
  const overhead = (p.minutos_mano_obra || 0) * ohPorMin;
  const total = material + manoObra + overhead;

  return {
    material: round2(material),
    mano_obra: round2(manoObra),
    overhead: round2(overhead),
    total: round2(total),
    minutos_mano_obra: p.minutos_mano_obra || 0,
    detalle_material: detalle
  };
}

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

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ---- Contraseñas y usuarios (solo crypto nativo de Node) ------------------
const crypto = require('crypto');

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(plain, almacenado) {
  if (!almacenado || !almacenado.includes(':')) return false;
  const [salt, hash] = almacenado.split(':');
  const calc = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(calc, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getUsuarioPorLogin(usuario) {
  return db.prepare('SELECT * FROM usuario WHERE usuario = ? AND activo = 1').get(String(usuario).trim().toLowerCase());
}
function getUsuario(id) {
  return db.prepare('SELECT id, nombre, usuario, rol, activo FROM usuario WHERE id = ?').get(id);
}
function listarUsuarios() {
  return db.prepare('SELECT id, nombre, usuario, rol, activo FROM usuario WHERE activo = 1 ORDER BY nombre').all();
}
function crearUsuario(nombre, usuario, plain, rol = 'operador') {
  const login = String(usuario).trim().toLowerCase();
  if (!login) throw new Error('Falta el usuario');
  if (!plain || String(plain).length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres');
  if (db.prepare('SELECT 1 FROM usuario WHERE usuario = ?').get(login)) throw new Error('Ese usuario ya existe');
  const r = db.prepare('INSERT INTO usuario (nombre, usuario, pass_hash, rol, creado) VALUES (?,?,?,?,?)')
    .run(String(nombre || login).trim(), login, hashPassword(plain), rol === 'admin' ? 'admin' : 'operador', ahoraAR());
  return Number(r.lastInsertRowid);
}
function cambiarPassword(id, plain) {
  if (!plain || String(plain).length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres');
  db.prepare('UPDATE usuario SET pass_hash = ? WHERE id = ?').run(hashPassword(plain), id);
}
function hayUsuarios() {
  return db.prepare('SELECT COUNT(*) c FROM usuario WHERE activo = 1').get().c > 0;
}
// Secreto para firmar la sesión: se guarda en config y persiste entre reinicios.
function getSessionSecret() {
  let s = getConfig('session_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setConfig('session_secret', s); }
  return s;
}

// ---- Datos de ejemplo (opcional) -----------------------------------------
function seed() {
  const yaHay = db.prepare('SELECT COUNT(*) c FROM producto').get().c;
  if (yaHay) {
    console.log('La base ya tiene productos: no se cargan datos de ejemplo.');
    return;
  }
  const fecha = ahoraAR();

  const ingredientes = [
    ['Harina 0000', 'kg', 30, 900],
    ['Huevos', 'unidad', 60, 220],
    ['Ricota', 'kg', 8, 4500],
    ['Espinaca', 'kg', 5, 2200],
    ['Jamón cocido', 'kg', 4, 9000],
    ['Queso muzzarella', 'kg', 6, 8000],
    ['Papa', 'kg', 20, 700],
    ['Manteca', 'kg', 3, 6500],
    ['Salsa de tomate', 'kg', 10, 1800]
  ];
  const insIng = db.prepare(
    'INSERT INTO ingrediente (nombre, unidad_base, stock, costo_unidad_base) VALUES (?,?,?,?)'
  );
  const ingId = {};
  for (const [n, u, s, c] of ingredientes) {
    const r = insIng.run(n, u, s, c);
    ingId[n] = Number(r.lastInsertRowid);
  }

  // producto: [nombre, categoria, unidad_stock, minutos_mano_obra, precio_unidad, precio_docena, precio_kg, vende_u, vende_d, vende_kg, vende_m]
  const productos = [
    ['Ravioles de ricota y verdura', 'Rellenas', 'unidad', 0.4, 280, 3000, 0, 0, 1, 0, 1],
    ['Sorrentinos de jamón y queso', 'Rellenas', 'unidad', 0.7, 600, 6500, 0, 0, 1, 0, 1],
    ['Canelones de verdura', 'Rellenas', 'unidad', 3, 1200, 0, 0, 1, 0, 0, 1],
    ['Tallarines', 'Simples', 'kg', 6, 0, 0, 3200, 0, 0, 1, 1],
    ['Tirabuzones', 'Simples', 'kg', 6, 0, 0, 3200, 0, 0, 1, 1],
    ['Ñoquis de papa', 'Simples', 'kg', 8, 0, 0, 3000, 0, 0, 1, 1],
    ['Tarta de jamón y queso', 'Tartas', 'unidad', 12, 4500, 0, 0, 1, 0, 0, 1]
  ];
  const insProd = db.prepare(`INSERT INTO producto
    (nombre, categoria, unidad_stock, minutos_mano_obra, precio_unidad, precio_docena, precio_kg,
     vende_unidad, vende_docena, vende_kg, vende_monto, stock)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const prodId = {};
  for (const p of productos) {
    const r = insProd.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], 0);
    prodId[p[0]] = Number(r.lastInsertRowid);
  }

  // Recetas: cantidades por 1 unidad de stock (kg base, unidad base)
  const insRec = db.prepare(
    'INSERT INTO receta_item (producto_id, ingrediente_id, cantidad_base) VALUES (?,?,?)'
  );
  const receta = (prod, items) => {
    for (const [ing, cant] of items) insRec.run(prodId[prod], ingId[ing], cant);
  };
  // por ravioli
  receta('Ravioles de ricota y verdura', [['Harina 0000', 0.012], ['Huevos', 0.08], ['Ricota', 0.015], ['Espinaca', 0.008]]);
  // por sorrentino
  receta('Sorrentinos de jamón y queso', [['Harina 0000', 0.02], ['Huevos', 0.1], ['Jamón cocido', 0.02], ['Queso muzzarella', 0.025]]);
  // por canelón
  receta('Canelones de verdura', [['Harina 0000', 0.04], ['Huevos', 0.3], ['Espinaca', 0.05], ['Ricota', 0.04]]);
  // por kg de tallarines / tirabuzones
  receta('Tallarines', [['Harina 0000', 0.7], ['Huevos', 5]]);
  receta('Tirabuzones', [['Harina 0000', 0.75], ['Huevos', 4]]);
  // por kg de ñoquis
  receta('Ñoquis de papa', [['Papa', 0.8], ['Harina 0000', 0.25], ['Huevos', 2], ['Manteca', 0.03]]);
  // por tarta
  receta('Tarta de jamón y queso', [['Harina 0000', 0.3], ['Huevos', 3], ['Jamón cocido', 0.15], ['Queso muzzarella', 0.2], ['Manteca', 0.1]]);

  console.log('Datos de ejemplo cargados: ' + Object.keys(prodId).length + ' productos, ' +
    Object.keys(ingId).length + ' ingredientes.');
}

crearEsquema();
migrarEsquema();

module.exports = {
  db, driver, DB_PATH,
  ahoraAR, hoyAR, mesAR,
  getConfig, getConfigNum, setConfig,
  overheadPorMinuto, costoProducto, round2, seed,
  hashPassword, verifyPassword, getUsuarioPorLogin, getUsuario, listarUsuarios,
  crearUsuario, cambiarPassword, hayUsuarios, getSessionSecret,
  generarCodigoInterno, buscarProductoPorCodigo, registrarRecepcionMercaderia
};

// CLI:
//   node db.js --seed                       -> datos de ejemplo
//   node db.js --crear-admin <user> <pass> [nombre]
if (require.main === module) {
  if (process.argv.includes('--seed')) {
    seed();
    console.log('Listo.');
  }
  const iAdmin = process.argv.indexOf('--crear-admin');
  if (iAdmin >= 0) {
    const usuario = process.argv[iAdmin + 1];
    const pass = process.argv[iAdmin + 2];
    const nombre = process.argv[iAdmin + 3] || usuario;
    if (!usuario || !pass) {
      console.error('Uso: node db.js --crear-admin <usuario> <contraseña> [nombre]');
      process.exit(1);
    }
    try {
      const existente = db.prepare('SELECT id FROM usuario WHERE usuario = ?').get(String(usuario).toLowerCase());
      if (existente) {
        cambiarPassword(existente.id, pass);
        db.prepare("UPDATE usuario SET rol='admin', activo=1 WHERE id=?").run(existente.id);
        console.log(`Usuario "${usuario}" actualizado (admin, nueva contraseña).`);
      } else {
        crearUsuario(nombre, usuario, pass, 'admin');
        console.log(`Administrador "${usuario}" creado.`);
      }
    } catch (e) { console.error('Error:', e.message); process.exit(1); }
  }
}
