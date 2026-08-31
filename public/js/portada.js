import { el, clear, money, colorCategoria, modal, cerrarModal } from './ui.js';

const WHATSAPP = '5493444525595';

let productos = [];
let categoriaActiva = 'Todos';
let busqueda = '';
let carrito = []; // { key, nombre, modo, cantidad, importe }
let chipsCont;
let resultadosCont;
let carritoCont;

async function cargar() {
  const cont = document.getElementById('catalogo');
  try {
    const res = await fetch('/api/publico/productos');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    productos = (await res.json()).map((p, i) => ({ ...p, key: i }));
    render();
  } catch (e) {
    clear(cont).appendChild(
      el('div', { class: 'vacio' }, ['No se pudo cargar el catálogo. Escribinos por WhatsApp.'])
    );
  }
}

// --- Precio / modos, mismo criterio que vender.js ---
function modosDe(p) {
  const m = [];
  if (p.vendeUnidad) m.push('unidad');
  if (p.vendeKg) m.push('kg');
  if (p.vendeDocena) m.push('docena');
  return m;
}
function precioUnitario(p, modo) {
  if (modo === 'unidad') return p.precioUnidad || 0;
  if (modo === 'kg') return p.precioKg || 0;
  if (modo === 'docena') return p.precioDocena || 0;
  return 0;
}
const ETIQUETA_MODO = { unidad: 'Unidad', kg: 'Por kilo', docena: 'Docena' };

function render() {
  const cont = document.getElementById('catalogo');
  const buscador = el('input', {
    id: 'catalog-search', type: 'search', placeholder: 'Buscar producto…', value: busqueda,
    oninput: (e) => { busqueda = e.target.value; renderResultados(); }
  });
  chipsCont = el('div');
  resultadosCont = el('div');
  carritoCont = el('div');

  clear(cont).appendChild(el('div', { class: 'catalog' }, [
    el('div', { class: 'catalog-toolbar' }, [
      el('div', { class: 'catalog-search' }, [
        el('label', { for: 'catalog-search', text: 'Buscar productos' }),
        buscador
      ]),
      chipsCont
    ]),
    resultadosCont,
    carritoCont
  ]));
  renderChips();
  renderResultados();
  renderCarrito();
}

function renderChips() {
  const cats = ['Todos', ...new Set(productos.map((p) => p.categoria))];
  const chips = el('div', { class: 'chips' }, cats.map((c) =>
    el('button', {
      class: 'chip' + (c === categoriaActiva ? ' activo' : ''),
      text: c,
      onClick: () => { categoriaActiva = c; renderChips(); renderResultados(); }
    })
  ));
  clear(chipsCont).appendChild(chips);
}

function renderResultados() {
  const term = busqueda.trim().toLowerCase();
  const lista = productos.filter((p) =>
    (categoriaActiva === 'Todos' || p.categoria === categoriaActiva) &&
    (!term || p.nombre.toLowerCase().includes(term))
  );
  const fichas = el('div', { class: 'product-grid' }, lista.map((p) => ficha(p)));

  clear(resultadosCont).appendChild(
    lista.length ? fichas : el('div', { class: 'vacio' }, ['No hay productos en esta categoría.'])
  );
}

function renderCarrito() {
  clear(carritoCont);
  const panel = carritoPanel();
  if (panel) carritoCont.appendChild(panel);
}

function ficha(p) {
  const modos = modosDe(p);
  return el('button', {
    class: 'product-card', disabled: (!p.disponible || !modos.length) ? '' : null,
    onClick: () => modos.length ? abrirAgregar(p, modos) : null
  }, [
    el('span', { class: 'product-card__accent', style: { background: colorCategoria(p.categoria) } }),
    el('div', { class: 'product-card__content' }, [
      el('span', { class: 'product-card__category', text: p.categoria }),
      el('span', { class: 'product-card__name', text: p.nombre })
    ]),
    el('div', { class: 'product-card__meta' }, [
      el('span', { class: 'product-card__price', text: p.precioTexto || 'Sin precio' }),
      p.disponible ? null : el('span', { class: 'product-card__status', text: 'Agotado' })
    ])
  ]);
}

function abrirAgregar(p, modos) {
  if (modos.length === 1) return pedirCantidad(p, modos[0]);
  modal({
    title: p.nombre,
    body: el('div', {}, [el('p', { text: '¿Cómo lo pedís?' }), el('div', { class: 'modo-botones' }, modos.map((m) =>
      el('button', { class: 'btn btn-primario btn-grande', text: ETIQUETA_MODO[m], onClick: () => { cerrarModal(); pedirCantidad(p, m); } })
    ))]),
    actions: [el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal })]
  });
}

function pedirCantidad(p, modo) {
  const existente = carrito.find((it) => it.key === p.key && it.modo === modo);
  const cantidad = (existente ? existente.cantidad : 0) + 1;
  agregarAlCarrito(p, modo, cantidad);
}

function agregarAlCarrito(p, modo, cantidad) {
  const importe = precioUnitario(p, modo) * cantidad;
  const existente = carrito.find((it) => it.key === p.key && it.modo === modo);
  if (existente) { existente.cantidad = cantidad; existente.importe = importe; }
  else carrito.push({ key: p.key, nombre: p.nombre, modo, cantidad, importe });
  renderCarrito();
}

function quitarDelCarrito(key, modo) {
  carrito = carrito.filter((it) => !(it.key === key && it.modo === modo));
  renderCarrito();
}

function detalleItem(it) {
  if (it.modo === 'unidad') return `${it.cantidad} u`;
  if (it.modo === 'docena') return `${it.cantidad} doc`;
  if (it.modo === 'kg') return `${it.cantidad} kg`;
  return '';
}

function mensajeWhatsapp() {
  const lineas = carrito.map((it) => `• ${it.nombre} (${detalleItem(it)})`);
  const total = carrito.reduce((a, it) => a + it.importe, 0);
  const texto = carrito.length
    ? `Hola! Quiero hacer este pedido:\n${lineas.join('\n')}\n\nTotal aprox: ${money(total)}`
    : 'Hola! Quiero hacer un pedido';
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
}

function carritoPanel() {
  if (!carrito.length) return null;
  const total = carrito.reduce((a, it) => a + it.importe, 0);
  return el('div', { class: 'panel order-card' }, [
    el('h2', { text: 'Tu pedido' }),
    el('div', { class: 'ticket-items' }, carrito.map((it) => el('div', { class: 'titem' }, [
      el('div', { class: 'titem-info' }, [
        el('div', { class: 'titem-nombre', text: it.nombre }),
        el('div', { class: 'titem-det', text: detalleItem(it) })
      ]),
      el('div', { class: 'titem-importe', text: money(it.importe) }),
      el('button', { class: 'titem-quitar', text: '×', title: 'Quitar', onClick: () => quitarDelCarrito(it.key, it.modo) })
    ]))),
    el('div', { class: 'ticket-total' }, [el('span', { text: 'Total' }), el('span', { text: money(total) })]),
    el('a', { class: 'btn btn-verde btn-grande btn-bloque', href: mensajeWhatsapp(), target: '_blank', rel: 'noopener', text: '🍝 Enviar pedido por WhatsApp' })
  ]);
}

cargar();
