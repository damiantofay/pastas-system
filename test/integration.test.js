'use strict';
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
    assert.equal((await fixture.request('/api/productos')).status, 401);
  });
});
