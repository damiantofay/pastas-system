import API from './api.js';
import { el, clear, toast, iconos } from './ui.js';
import { vistaVender } from './vender.js';
import { vistaCaja } from './caja.js';
import { vistaProductos } from './productos.js';
import { vistaStock } from './stock.js';
import { vistaGastos } from './gastos.js';
import { vistaReportes } from './reportes.js';
import { vistaAjustes } from './ajustes.js';

const VISTAS = [
  { id: 'vender', label: 'Vender', icono: 'vender', fn: vistaVender },
  { id: 'caja', label: 'Caja', icono: 'caja', fn: vistaCaja },
  { id: 'stock', label: 'Stock', icono: 'stock', fn: vistaStock },
  { id: 'productos', label: 'Productos', icono: 'productos', fn: vistaProductos },
  { id: 'gastos', label: 'Gastos', icono: 'gastos', fn: vistaGastos },
  { id: 'reportes', label: 'Costos', icono: 'reportes', fn: vistaReportes },
  { id: 'ajustes', label: 'Ajustes', icono: 'ajustes', fn: vistaAjustes }
];

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let actual = null;

function rutaActual() {
  const h = (location.hash || '#vender').replace('#', '');
  return VISTAS.find((v) => v.id === h) ? h : 'vender';
}

async function montar(id) {
  const v = VISTAS.find((x) => x.id === id);
  if (!v) return;
  actual = id;
  pintarNav();
  clear(main).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  try { await v.fn(main); }
  catch (e) { clear(main).appendChild(el('div', { class: 'vista' }, [el('div', { class: 'aviso', text: 'Error: ' + e.message })])); }
}

function pintarNav() {
  clear(nav);
  nav.appendChild(el('div', { class: 'nav-marca' }, [
    el('span', { html: iconos.marca }), el('span', { text: window.__negocio || 'Fábrica de Pastas' })
  ]));
  for (const v of VISTAS) {
    nav.appendChild(el('a', {
      class: 'nav-btn' + (v.id === actual ? ' activo' : ''),
      href: '#' + v.id
    }, [el('span', { html: iconos[v.icono] }), el('span', { text: v.label })]));
  }
  const u = window.__usuario;
  if (u) {
    nav.appendChild(el('button', {
      class: 'nav-btn', style: { marginTop: 'auto' }, title: 'Cerrar sesión', onClick: salir
    }, [el('span', { html: iconos.ajustes }), el('span', {}, [el('span', { text: 'Salir' }), el('span', { class: 'nav-usuario', text: u.nombre })])]));
  }
}

async function salir() {
  try { await API.post('/api/logout'); } catch (_) {}
  location.href = '/login.html';
}

window.addEventListener('hashchange', () => montar(rutaActual()));

(async function init() {
  try {
    const me = await API.get('/api/me');   // si no hay sesión, 401 -> redirige al login
    window.__usuario = me;
    const cfg = await API.get('/api/config');
    window.__negocio = cfg.nombre_negocio || 'Fábrica de Pastas';
    document.title = window.__negocio;
  } catch (e) { return; } // el 401 ya redirige
  montar(rutaActual());
})();
