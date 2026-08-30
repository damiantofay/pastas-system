import API from './api.js';
import { el, clear, money, numAR, modal, cerrarModal, toast, colorCategoria } from './ui.js';
import { activarEscaner } from './scanner.js';

let productos = [];
let categoriaActiva = 'Todos';
let carrito = [];

const ETIQUETA_MODO = { unidad: 'Unidad', docena: 'Docena', kg: 'Por kilo', monto: 'Por monto' };

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

function modosDe(p) {
  const m = [];
  if (p.vende_unidad) m.push('unidad');
  if (p.vende_docena) m.push('docena');
  if (p.vende_kg) m.push('kg');
  if (p.vende_monto) m.push('monto');
  return m;
}

function precioPreview(p, modo, cant, monto) {
  if (modo === 'unidad') return cant * p.precio_unidad;
  if (modo === 'docena') return p.precio_docena > 0 ? cant * p.precio_docena : cant * 12 * p.precio_unidad;
  if (modo === 'kg') return cant * p.precio_kg;
  if (modo === 'monto') return monto;
  return 0;
}

function detalleItem(it) {
  const p = it.producto;
  if (it.modo === 'unidad') return `${numAR(it.cantidad, 0)} u × ${money(p.precio_unidad)}`;
  if (it.modo === 'docena') return `${numAR(it.cantidad, 0)} doc`;
  if (it.modo === 'kg') return `${numAR(it.cantidad, 3)} kg × ${money(p.precio_kg)}`;
  if (it.modo === 'monto') return `Monto libre`;
  return '';
}

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

  const pos = el('div', { class: 'pos' }, [cuerpo, ticket(main)]);

  clear(main).appendChild(el('div', { class: 'vista' }, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Vender' })])]),
    pos
  ]));
}

function lineaUnidadDe(p) {
  return carrito.find((it) => it.producto.id === p.id && it.modo === 'unidad');
}

function agregarUnidadRapida(p, main) {
  const importeUnidad = precioPreview(p, 'unidad', 1, 0);
  if (importeUnidad <= 0) { toast(`Falta el precio de "${p.nombre}"`, 'error'); return; }
  const linea = lineaUnidadDe(p);
  if (linea) { linea.cantidad += 1; linea.importe = precioPreview(p, 'unidad', linea.cantidad, 0); }
  else carrito.push({ producto: p, modo: 'unidad', cantidad: 1, importe: importeUnidad });
  render(main);
  const fichaEl = main.querySelector(`[data-producto-id="${p.id}"]`);
  if (fichaEl) fichaEl.classList.add('ficha-pulso');
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
  const nodo = el('div', {
    class: 'ficha',
    dataset: { productoId: p.id }
  }, [
    el('span', { class: 'ficha-cat', style: { background: colorCategoria(p.categoria) } }),
    linea ? el('span', { class: 'ficha-badge', text: '×' + numAR(linea.cantidad, 0) }) : null,
    el('button', {
      class: 'ficha-principal',
      onClick: () => { if (p.vende_unidad) agregarUnidadRapida(p, main); else abrirAgregar(p, main); }
    }, [
      el('div', { class: 'ficha-nombre', text: p.nombre }),
      el('div', {}, [
        el('div', { class: 'ficha-precio', text: precioTxt || 'Sin precio' }),
        el('div', { class: 'ficha-stock' + (bajo ? ' bajo' : ''), text:
          `Stock: ${numAR(p.stock, p.unidad_stock === 'kg' ? 1 : 0)} ${p.unidad_stock === 'kg' ? 'kg' : 'u'}` })
      ])
    ]),
    (modos.length > 1 && p.vende_unidad) ? el('button', {
      class: 'ficha-mas', title: 'Más opciones', text: '⋯',
      onClick: (e) => { e.stopPropagation(); abrirAgregar(p, main); }
    }) : null
  ]);
  return nodo;
}

// --- Agregar producto al ticket ---
function abrirAgregar(p, main) {
  const modos = modosDe(p);
  if (!modos.length) { toast('Ese producto no tiene forma de venta configurada', 'error'); return; }
  if (modos.length === 1) { pedirCantidad(p, modos[0], main); return; }
  const botones = modos.map((m) =>
    el('button', { class: 'btn btn-primario btn-grande', text: ETIQUETA_MODO[m], onClick: () => pedirCantidad(p, m, main) })
  );
  modal({
    title: p.nombre,
    body: el('div', {}, [el('p', { text: '¿Cómo lo vendés?' }), el('div', { class: 'modo-botones' }, botones)]),
    actions: [el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal })]
  });
}

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

  const tecla = (t) => {
    if (t === '←') valor = valor.slice(0, -1);
    else if (t === '.') { if (decimales && !valor.includes('.')) valor += valor === '' ? '0.' : '.'; }
    else valor += t;
    refrescar();
  };
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimales ? '.' : '', '0', '←'];
  const keypad = el('div', { class: 'keypad' }, teclas.map((t) =>
    t === '' ? el('div') : el('button', { text: t, onClick: () => tecla(t) })
  ));

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

  modal({
    title: `${p.nombre} — ${ETIQUETA_MODO[modo]}`,
    body: el('div', {}, [visor, keypad]),
    actions: [
      el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
      el('button', { class: 'btn btn-verde', text: 'Agregar', onClick: aceptar })
    ]
  });
}

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

  const cont = el('div', { class: 'ticket' }, [
    el('h2', { text: 'Pedido', onClick: () => cont.classList.toggle('abierto') }),
    el('div', { class: 'ticket-items' }, items),
    el('div', { class: 'ticket-pie' }, [
      el('div', { class: 'ticket-total' }, [el('span', { text: 'Total' }), el('span', { text: money(total) })]),
      el('button', {
        class: 'btn btn-verde btn-grande', text: 'Cobrar',
        disabled: carrito.length === 0 ? '' : null,
        onClick: () => cobrar(main)
      })
    ])
  ]);
  if (carrito.length) cont.classList.add('abierto');
  window.__ticket = cont;
  return cont;
}
function abrirTicketMobile() { if (window.__ticket) window.__ticket.classList.add('abierto'); }

function cobrar(main) {
  const total = carrito.reduce((a, it) => a + it.importe, 0);
  const medios = [
    ['efectivo', 'Efectivo'],
    ['transferencia', 'Transferencia'],
    ['tarjeta', 'Tarjeta']
  ];
  const botones = medios.map(([v, l]) =>
    el('button', { class: 'btn btn-primario btn-grande', text: l, onClick: () => confirmarVenta(v, main) })
  );
  modal({
    title: `Cobrar ${money(total)}`,
    body: el('div', {}, [el('p', { text: '¿Cómo te pagan?' }), el('div', { class: 'modo-botones' }, botones)]),
    actions: [el('button', { class: 'btn btn-fantasma', text: 'Volver', onClick: cerrarModal })]
  });
}

async function confirmarVenta(medio, main) {
  try {
    const items = carrito.map((it) => ({
      producto_id: it.producto.id, modo: it.modo,
      cantidad: it.cantidad, importe: it.importe
    }));
    const r = await API.post('/api/ventas', { medio_pago: medio, items });
    cerrarModal();
    toast(`Venta registrada: ${money(r.total)}`, 'ok');
    carrito = [];
    productos = await API.get('/api/productos'); // refresca stock
    render(main);
  } catch (e) {
    toast(e.message, 'error');
  }
}
