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
    assert.equal((await fixture.request('/api/productos')).status, 401);
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
