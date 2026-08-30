'use strict';
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { startFixture } = require('./helpers/app-fixture');

test('servidor aislado', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.stop());

  await t.test('expone portada y catálogo sin revelar APIs privadas', async () => {
    assert.equal((await fixture.request('/')).status, 200);
    const catalog = await fixture.request('/api/publico/productos');
    assert.equal(catalog.status, 200);
    assert.ok(Array.isArray(catalog.body));
    assert.ok(catalog.body.length > 0);
    const allowedCatalogKeys = [
      'categoria', 'disponible', 'nombre', 'precioDocena', 'precioKg',
      'precioTexto', 'precioUnidad', 'vendeDocena', 'vendeKg', 'vendeUnidad'
    ];
    for (const product of catalog.body) {
      assert.deepEqual(Object.keys(product).sort(), allowedCatalogKeys);
    }
    assert.equal((await fixture.request('/api/productos')).status, 401);
  });

  await t.test('autentica al administrador y no expone secretos de configuración', async () => {
    assert.equal((await fixture.login('admin', 'incorrecta')).status, 401);
    assert.equal((await fixture.login('admin', 'prueba-segura-2026')).status, 200);
    assert.equal((await fixture.request('/api/me')).body.rol, 'admin');
    const config = await fixture.request('/api/config');
    assert.equal(config.status, 200);
    assert.equal(Object.hasOwn(config.body, 'session_secret'), false);
  });

  await t.test('registra una venta en efectivo, descuenta stock y la anulación lo repone', async () => {
    const product = await fixture.request('/api/productos', {
      method: 'POST',
      json: {
        nombre: 'Producto de reventa de prueba',
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
    const reception = await fixture.request('/api/productos/' + product.body.id + '/recepcion', {
      method: 'POST',
      json: { cantidad: 10, costo_total: 200, pagado_con: 'efectivo' }
    });
    assert.equal(reception.status, 200);
    const sale = await fixture.request('/api/ventas', {
      method: 'POST',
      json: {
        items: [{ producto_id: product.body.id, modo: 'unidad', cantidad: 2 }],
        medio_pago: 'efectivo'
      }
    });
    assert.equal(sale.status, 200);
    assert.equal(sale.body.total, 100);
    assert.equal((await fixture.request('/api/productos/' + product.body.id)).body.stock, 8);
    assert.equal((await fixture.request('/api/caja')).body.total_ventas, 100);
    assert.equal((await fixture.request('/api/ventas/' + sale.body.id, { method: 'DELETE' })).status, 200);
    assert.equal((await fixture.request('/api/productos/' + product.body.id)).body.stock, 10);
  });

  await t.test('crea un pedido y permite marcarlo listo', async () => {
    const order = await fixture.request('/api/pedidos', {
      method: 'POST',
      json: {
        cliente_telefono: '11 5555 0101',
        items: [{ descripcion: 'Pedido de prueba', importe: 250 }]
      }
    });
    assert.equal(order.status, 200);
    assert.equal(order.body.total, 250);
    const ready = await fixture.request('/api/pedidos/' + order.body.id + '/estado', {
      method: 'PUT',
      json: { estado: 'listo' }
    });
    assert.equal(ready.body.estado, 'listo');

    const orders = await fixture.request('/api/pedidos');
    assert.equal(orders.status, 200);
    const returnedOrder = orders.body.find((candidate) => candidate.id === order.body.id);
    assert.ok(returnedOrder);
    assert.equal(returnedOrder.cliente_telefono, '11 5555 0101');
    assert.equal(returnedOrder.estado, 'listo');
    assert.equal(returnedOrder.total, 250);
    assert.equal(returnedOrder.items.length, 1);
    assert.equal(returnedOrder.items[0].descripcion, 'Pedido de prueba');
    assert.equal(returnedOrder.items[0].importe, 250);
  });

});

test('encabezados de seguridad', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.stop());

  await t.test('aplica encabezados de seguridad a la portada', async () => {
    const response = await fixture.request('/');

    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    assert.equal(response.headers.has('x-powered-by'), false);
  });
});

test('limpia el proceso y la base temporal si el inicio falla', async () => {
  let child;
  let tempDir;
  try {
    await assert.rejects(
      startFixture({
        hooks: {
          afterSpawn(context) {
            child = context.child;
            tempDir = context.tempDir;
            throw new Error('fallo de inicio forzado');
          }
        }
      }),
      /fallo de inicio forzado/
    );

    assert.ok(child);
    assert.ok(tempDir);
    assert.equal(child.killed, true);
    assert.equal(fs.existsSync(tempDir), false);
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      if (child?.exitCode == null) child.kill();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

test('limita intentos de login por cliente detrás del proxy local', async (t) => {
  const fixture = await startFixture();
  t.after(() => fixture.stop());

  async function loginFallido(ip) {
    return fetch(fixture.baseUrl + '/api/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip
      },
      body: JSON.stringify({ usuario: 'admin', contraseña: 'incorrecta' })
    });
  }

  for (let intento = 0; intento < 5; intento += 1) {
    assert.equal((await loginFallido('198.51.100.10')).status, 401);
  }

  assert.equal((await loginFallido('198.51.100.11')).status, 401);
  assert.equal((await loginFallido('198.51.100.10')).status, 429);
});
