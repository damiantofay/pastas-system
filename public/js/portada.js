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
