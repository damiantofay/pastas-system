'use strict';
/*
 * Autenticación simple, sin dependencias extra.
 * - Contraseñas hasheadas con scrypt (en db.js).
 * - Sesión guardada en una cookie httpOnly firmada con HMAC.
 * El secreto de firma se guarda en la config y persiste entre reinicios.
 */
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const D = require('./db');

// Máx 5 intentos de login por IP cada 15 minutos.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.' },
  handler: (req, res) => {
    res.status(429).json({ error: 'Demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.' });
  },
});

const COOKIE = 'sesion';
const DIAS = 30;
// En producción (detrás de HTTPS) poné COOKIE_SEGURA=1 para marcar la cookie como Secure.
const SEGURA = process.env.COOKIE_SEGURA === '1';

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function deB64url(s) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

function firmar(payload) {
  const secret = D.getSessionSecret();
  return crypto.createHmac('sha256', secret).update(payload).digest();
}
function crearToken(userId) {
  const exp = Date.now() + DIAS * 24 * 3600 * 1000;
  const payload = `${userId}.${exp}`;
  const sig = b64url(firmar(payload));
  return `${b64url(payload)}.${sig}`;
}
function verificarToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [pB64, sig] = token.split('.');
  let payload;
  try { payload = deB64url(pB64).toString(); } catch { return null; }
  const esperado = b64url(firmar(payload));
  const a = Buffer.from(sig), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [userId, exp] = payload.split('.');
  if (!exp || Date.now() > Number(exp)) return null;
  return Number(userId);
}

function leerCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setCookie(res, token) {
  const partes = [`${COOKIE}=${token}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${DIAS * 24 * 3600}`];
  if (SEGURA) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}
function borrarCookie(res) {
  res.append('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function usuarioDeReq(req) {
  const token = leerCookies(req)[COOKIE];
  const id = verificarToken(token);
  if (!id) return null;
  return D.getUsuario(id);
}

// Guardia para /api: deja pasar solo con sesión válida.
function requireAuth(req, res, next) {
  const u = usuarioDeReq(req);
  if (!u || !u.activo) return res.status(401).json({ error: 'Tenés que iniciar sesión' });
  req.usuario = u;
  next();
}
function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Necesitás permisos de administrador' });
  next();
}

// Registra /api/login, /api/logout y /api/me. Devuelve los middlewares.
function montar(app) {
  app.post('/api/login', loginLimiter, (req, res) => {
    try {
      const u = D.getUsuarioPorLogin(req.body.usuario || '');
      if (!u || !D.verifyPassword(req.body.contraseña || req.body.contrasena || '', u.pass_hash)) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }
      setCookie(res, crearToken(u.id));
      res.json({ nombre: u.nombre, usuario: u.usuario, rol: u.rol });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/logout', (req, res) => { borrarCookie(res); res.json({ ok: true }); });

  app.get('/api/me', (req, res) => {
    const u = usuarioDeReq(req);
    if (!u) return res.status(401).json({ error: 'Sin sesión' });
    res.json({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol });
  });

  return { requireAuth, requireAdmin };
}

module.exports = { montar, requireAuth, requireAdmin };
