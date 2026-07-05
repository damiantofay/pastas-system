// Helpers de interfaz: construir elementos, formatear, modales, avisos.

// --- Construcción de elementos (hyperscript) ---
export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return n;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

// --- Formato de dinero (Argentina) ---
export function money(n) {
  const v = Number(n) || 0;
  return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
export function numAR(n, dec = 2) {
  return (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
// Muestra cantidades de receta de forma legible (kg/l -> g/ml)
export function cantLegible(cantidad, unidadBase) {
  const c = Number(cantidad) || 0;
  if (unidadBase === 'kg') return c < 1 ? `${numAR(c * 1000, 0)} g` : `${numAR(c, 3)} kg`;
  if (unidadBase === 'l') return c < 1 ? `${numAR(c * 1000, 0)} ml` : `${numAR(c, 3)} l`;
  return `${numAR(c, 0)} u`;
}

// --- Toast ---
export function toast(msg, tipo = '') {
  const t = el('div', { class: 'toast ' + tipo, text: msg });
  document.getElementById('toast-root').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// --- Modal ---
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
export function cerrarModal() { clear(document.getElementById('modal-root')); }

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

// --- Construir un campo de formulario ---
export function campo(label, inputEl, ayuda) {
  return el('div', { class: 'campo' }, [
    el('label', {}, [label, ayuda ? el('span', { class: 'ayuda', text: '  ' + ayuda }) : null]),
    inputEl
  ]);
}
export function input(attrs = {}) { return el('input', attrs); }
export function select(opciones, valor, attrs = {}) {
  const s = el('select', attrs);
  for (const o of opciones) {
    const op = el('option', { value: o.value }, [o.label]);
    if (String(o.value) === String(valor)) op.selected = true;
    s.appendChild(op);
  }
  return s;
}

// --- Iconos (SVG simples) ---
const I = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const iconos = {
  vender: I('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>'),
  caja: I('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
  productos: I('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  stock: I('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12l8.73-5.04"/><path d="M12 22V12"/>'),
  gastos: I('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  reportes: I('<path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="8"/><rect x="12" y="6" width="3" height="12"/><rect x="17" y="13" width="3" height="5"/>'),
  ajustes: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  marca: I('<path d="M4 20s2-8 8-8 8 8 8 8"/><circle cx="12" cy="6" r="3"/>')
};

// Color por categoría (para la franja de la ficha)
const PALETA = ['#1F4D34', '#2E1F17', '#1A1A1A', '#4A7A5C', '#8B6A4F', '#3D5A45'];
export function colorCategoria(cat) {
  let h = 0; for (const ch of String(cat)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return PALETA[h % PALETA.length];
}
