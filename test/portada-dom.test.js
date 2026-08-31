'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { startFixture } = require('./helpers/app-fixture');

const ROOT = path.resolve(__dirname, '..');

function asDataModule(source) {
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}

async function waitFor(predicate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('La portada no terminó de cargar dentro de 5 segundos');
}

async function cargarPortada(t, { prepararFixture } = {}) {
  const fixture = await startFixture();
  const dom = new JSDOM('<div id="catalogo"></div><div id="modal-root"></div><div id="toast-root"></div>', {
    url: fixture.baseUrl + '/'
  });
  const previous = {
    document: global.document,
    window: global.window,
    fetch: global.fetch,
    requestAnimationFrame: global.requestAnimationFrame
  };
  const realFetch = global.fetch;

  global.document = dom.window.document;
  global.window = dom.window;
  global.fetch = (input, init) => realFetch(new URL(input, fixture.baseUrl), init);
  global.requestAnimationFrame = (callback) => setTimeout(callback, 0);

  t.after(async () => {
    global.document = previous.document;
    global.window = previous.window;
    global.fetch = previous.fetch;
    global.requestAnimationFrame = previous.requestAnimationFrame;
    dom.window.close();
    await fixture.stop();
  });

  if (prepararFixture) await prepararFixture(fixture);

  const uiSource = fs.readFileSync(path.join(ROOT, 'public', 'js', 'ui.js'), 'utf8');
  const portadaSource = fs.readFileSync(path.join(ROOT, 'public', 'js', 'portada.js'), 'utf8')
    .replace("from './ui.js'", `from '${asDataModule(uiSource)}'`);
  await import(asDataModule(portadaSource) + '#' + Date.now());

  return { dom };
}

test('el catálogo muestra controles y productos con estructura accesible', async (t) => {
  await cargarPortada(t);

  const input = await waitFor(() => document.querySelector('#catalogo input[type="search"]'));
  const searchLabel = document.querySelector('label[for="catalog-search"]');
  assert.equal(searchLabel?.textContent, 'Buscar productos');
  assert.equal(input.id, 'catalog-search');

  const toolbar = document.querySelector('#catalogo .catalog-toolbar');
  assert.ok(toolbar);
  const chips = [...toolbar.querySelectorAll('.chip')];
  assert.ok(chips.length > 1);
  assert.equal(chips[0].getAttribute('aria-pressed'), 'true');
  assert.equal(chips[1].getAttribute('aria-pressed'), 'false');

  chips[1].click();
  const updatedChips = [...toolbar.querySelectorAll('.chip')];
  assert.equal(updatedChips[0].getAttribute('aria-pressed'), 'false');
  assert.equal(updatedChips[1].getAttribute('aria-pressed'), 'true');

  const grid = document.querySelector('#catalogo .product-grid');
  assert.ok(grid);
  const productCard = grid.querySelector('.product-card');
  assert.ok(productCard);
  assert.match(productCard.querySelector('.product-card__category').textContent, /\S/);

  const soldOutStatus = grid.querySelector('.product-card[disabled] .product-card__status');
  assert.ok(soldOutStatus);
  assert.equal(soldOutStatus.textContent, 'Agotado');
});

test('buscar en el catálogo conserva el input enfocado y el caret', async (t) => {
  const { dom } = await cargarPortada(t);

  const input = await waitFor(() => document.querySelector('#catalogo input[type="search"]'));

  input.focus();
  input.value = 'rav';
  input.setSelectionRange(2, 2);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

  assert.equal(document.querySelector('#catalogo input[type="search"]'), input);
  assert.equal(document.activeElement, input);
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 2);
});

test('agregar y quitar un producto actualiza el total y el enlace real de WhatsApp', async (t) => {
  await cargarPortada(t, {
    prepararFixture: async (fixture) => {
      assert.equal((await fixture.login('admin', 'prueba-segura-2026')).status, 200);
      const product = await fixture.request('/api/productos', {
        method: 'POST',
        json: {
          nombre: 'Producto público de prueba',
          categoria: 'Pruebas',
          unidad_stock: 'unidad',
          tipo: 'reventa',
          precio_unidad: 50,
          vende_unidad: true,
          vende_docena: false,
          vende_kg: false,
          vende_monto: false
        }
      });
      assert.equal(product.status, 200);
      assert.equal((await fixture.request(`/api/productos/${product.body.id}/recepcion`, {
        method: 'POST',
        json: { cantidad: 2, costo_total: 60, pagado_con: 'efectivo' }
      })).status, 200);
    }
  });

  const productCard = await waitFor(() => [...document.querySelectorAll('.product-card')]
    .find((card) => card.textContent.includes('Producto público de prueba')));
  productCard.click();

  const order = document.querySelector('.order-card');
  assert.equal(order.querySelector('.titem-nombre').textContent, 'Producto público de prueba');
  assert.equal(order.querySelector('.titem-det').textContent, '1 u');
  assert.equal(order.querySelector('.ticket-total').textContent, 'Total$ 50');

  const whatsappUrl = new URL(order.querySelector('a[href^="https://wa.me/"]').href);
  assert.equal(whatsappUrl.pathname, '/5493444525595');
  assert.equal(
    whatsappUrl.searchParams.get('text'),
    'Hola! Quiero hacer este pedido:\n• Producto público de prueba (1 u)\n\nTotal aprox: $ 50'
  );

  order.querySelector('.titem-quitar').click();
  assert.equal(document.querySelector('.order-card'), null);
});
