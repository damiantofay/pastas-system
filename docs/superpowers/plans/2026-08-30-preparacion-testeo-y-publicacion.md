# Preparación para testeo y publicación Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar la fuente recuperada, agregar una suite HTTP reproducible, endurecer respuestas, publicar la rama y desplegarla de forma reversible en el dominio oficial.

**Architecture:** Las pruebas usan `node:test`, un proceso real de `server.js` y una SQLite temporal creada por la CLI real. El despliegue conserva `data/`, crea backups verificables y sólo reinicia PM2 después de que un release aislado supera pruebas.

**Tech Stack:** Node.js 22+, Express, SQLite, frontend ES modules, PM2, Nginx, PowerShell local y Bash remoto.

**Spec:** `docs/superpowers/specs/2026-08-30-preparacion-testeo-y-publicacion-design.md`

## Global Constraints

- No borrar, reemplazar ni copiar a GitHub la base de producción.
- No reescribir ni forzar la historia Git recuperada.
- No usar `npm audit fix --force`.
- Toda prueba debe usar un `DB_PATH` temporal.
- El dominio oficial continúa siendo el entorno de prueba.
- Un fallo de health o smoke obliga a restaurar el release anterior.

---

### Task 1: Preservar los cambios recuperados

**Files:**
- Modify: `public/js/vender.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: parche binario `uncommitted-production.patch` del backup verificado.
- Produces: commit que representa exactamente los dos cambios que ya ejecutaba producción.

- [ ] **Step 1: Aplicar el parche recuperado en el worktree**

Run:

```powershell
git apply --check "C:\Users\damia\Sistemaya Backups\ELSASTREDELAPASTA\20260830T121103Z\uncommitted-production.patch"
git apply "C:\Users\damia\Sistemaya Backups\ELSASTREDELAPASTA\20260830T121103Z\uncommitted-production.patch"
```

Expected: `public/js/vender.js` y `public/styles.css` modificados, sin otros archivos.

- [ ] **Step 2: Verificar el parche contra la evidencia**

Run:

```powershell
git diff --check
git diff --stat
git diff --binary | git patch-id --stable
```

Expected: dos archivos, 30 inserciones, 3 eliminaciones y ningún error de whitespace.

- [ ] **Step 3: Validar sintaxis frontend**

Run:

```powershell
Get-Content public/js/vender.js -Raw | node --input-type=module --check
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```powershell
git add public/js/vender.js public/styles.css
git commit -m "feat: recuperar agregado rápido en ventas"
```

### Task 2: Crear el arnés HTTP aislado

**Files:**
- Create: `test/helpers/app-fixture.js`
- Create: `test/integration.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `startFixture()` que devuelve `{ baseUrl, request, login, stop }`.
- `request(path, options)` devuelve `{ status, body, headers }` y conserva la cookie de sesión.

- [ ] **Step 1: Crear el helper de servidor real**

`test/helpers/app-fixture.js` debe:

```javascript
'use strict';
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error('Servidor finalizó antes de iniciar\n' + output());
    try {
      const response = await fetch(baseUrl + '/');
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor no respondió dentro de 10 segundos\n' + output());
}

async function startFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pastas-test-'));
  const dbPath = path.join(tempDir, 'fabrica-test.db');
  const env = { ...process.env, DB_PATH: dbPath, COOKIE_SEGURA: '0' };
  const runCli = (args) => {
    const result = spawnSync(process.execPath, args, { cwd: ROOT, env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  };
  runCli(['db.js', '--seed']);
  runCli(['db.js', '--crear-admin', 'admin', 'prueba-segura-2026', 'Admin Test']);

  const port = await reservePort();
  let stdout = '', stderr = '', cookie = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child, () => stdout + stderr);

  async function request(route, { method = 'GET', json, auth = true } = {}) {
    const headers = {};
    if (json !== undefined) headers['content-type'] = 'application/json';
    if (auth && cookie) headers.cookie = cookie;
    const response = await fetch(baseUrl + route, {
      method, headers, body: json === undefined ? undefined : JSON.stringify(json)
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';', 1)[0];
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, body, headers: response.headers };
  }

  async function login(usuario, contraseña) {
    cookie = '';
    return request('/api/login', { method: 'POST', auth: false, json: { usuario, contraseña } });
  }

  async function stop() {
    if (child.exitCode == null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return { baseUrl, request, login, stop };
}

module.exports = { startFixture };
```

- [ ] **Step 2: Crear una primera prueba de contrato existente**

`test/integration.test.js`:

```javascript
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
```

- [ ] **Step 3: Ejecutar la prueba**

Run: `node --test --test-concurrency=1 test/integration.test.js`

Expected: PASS; es una prueba de caracterización de comportamiento recuperado.

- [ ] **Step 4: Agregar scripts npm**

`package.json`:

```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js",
  "seed": "node db.js --seed",
  "test": "node --test --test-concurrency=1",
  "test:syntax": "node scripts/check-syntax.js"
}
```

- [ ] **Step 5: Commit**

```powershell
git add package.json test/helpers/app-fixture.js test/integration.test.js
git commit -m "test: agregar arnés HTTP con base aislada"
```

### Task 3: Endurecer encabezados con TDD

**Files:**
- Modify: `test/integration.test.js`
- Modify: `server.js`

**Interfaces:**
- Produces: respuestas HTTP con seis encabezados de seguridad y sin `X-Powered-By`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar un subtest que haga `GET /` y compare literalmente:

```javascript
assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
assert.equal(response.headers.get('x-frame-options'), 'DENY');
assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
assert.equal(response.headers.has('x-powered-by'), false);
```

- [ ] **Step 2: Verificar RED**

Run: `npm test -- --test-name-pattern="encabezados"`

Expected: FAIL porque los encabezados todavía no existen.

- [ ] **Step 3: Implementar el middleware mínimo**

Después de crear `app` en `server.js`:

```javascript
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});
```

- [ ] **Step 4: Verificar GREEN**

Run: `npm test -- --test-name-pattern="encabezados"`

Expected: PASS.

- [ ] **Step 5: Ejecutar toda la suite y commit**

```powershell
npm test
git add server.js test/integration.test.js
git commit -m "security: agregar encabezados HTTP básicos"
```

### Task 4: Cubrir flujos críticos

**Files:**
- Modify: `test/integration.test.js`

**Interfaces:**
- Consumes: fixture y cliente autenticado de Task 2.
- Produces: cobertura integrada de autenticación, configuración, productos, ventas, caja y pedidos.

- [ ] **Step 1: Agregar autenticación y configuración**

Comprobar:

```javascript
assert.equal((await fixture.login('admin', 'incorrecta')).status, 401);
assert.equal((await fixture.login('admin', 'prueba-segura-2026')).status, 200);
assert.equal((await fixture.request('/api/me')).body.rol, 'admin');
const config = await fixture.request('/api/config');
assert.equal(config.status, 200);
assert.equal(Object.hasOwn(config.body, 'session_secret'), false);
```

- [ ] **Step 2: Agregar producto, recepción, venta y rollback de stock**

Crear un producto de reventa a $50, recibir 10 unidades por $200, vender 2 en efectivo y comprobar literalmente:

```javascript
assert.equal(sale.body.total, 100);
assert.equal((await fixture.request('/api/productos/' + product.body.id)).body.stock, 8);
assert.equal((await fixture.request('/api/caja')).body.total_ventas, 100);
assert.equal((await fixture.request('/api/ventas/' + sale.body.id, { method: 'DELETE' })).status, 200);
assert.equal((await fixture.request('/api/productos/' + product.body.id)).body.stock, 10);
```

- [ ] **Step 3: Agregar pedido y transición**

Crear un pedido con teléfono de prueba, un item de $250 y comprobar:

```javascript
assert.equal(order.body.total, 250);
const ready = await fixture.request('/api/pedidos/' + order.body.id + '/estado', {
  method: 'PUT',
  json: { estado: 'listo' }
});
assert.equal(ready.body.estado, 'listo');
```

- [ ] **Step 4: Ejecutar la suite**

Run: `npm test`

Expected: todos los subtests PASS y el directorio temporal eliminado.

- [ ] **Step 5: Mutation check**

Cambiar temporalmente en el worktree el cálculo de venta de unidad de multiplicación a suma, ejecutar el subtest de venta y observar FAIL; restaurar el archivo con `git restore server.js` únicamente después de confirmar la falla.

- [ ] **Step 6: Commit**

```powershell
git add test/integration.test.js
git commit -m "test: cubrir operaciones críticas del sistema"
```

### Task 5: Sintaxis y dependencias

**Files:**
- Create: `scripts/check-syntax.js`
- Modify: `package-lock.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run test:syntax` portable y auditoría npm limpia.

- [ ] **Step 1: Crear el verificador portable**

`scripts/check-syntax.js`:

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const backend = ['server.js', 'db.js', 'auth.js'];
const frontendDir = path.join(root, 'public', 'js');
const frontend = fs.readdirSync(frontendDir)
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => path.join('public', 'js', name));
let failures = 0;

for (const relative of backend) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' });
  if (result.status !== 0) { failures++; process.stderr.write(result.stderr); }
}
for (const relative of frontend) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  if (result.status !== 0) { failures++; process.stderr.write(relative + '\n' + result.stderr); }
}
console.log(`Backend: ${backend.length}; frontend: ${frontend.length}; fallos: ${failures}`);
process.exitCode = failures ? 1 : 0;
```

- [ ] **Step 2: Ejecutar sintaxis**

Run: `npm run test:syntax`

Expected: 3 módulos backend y 13 frontend, 0 fallos.

- [ ] **Step 3: Actualizar dependencias de forma compatible**

Run:

```powershell
npm audit fix
npm audit
npm test
npm run test:syntax
```

Expected: auditoría con 0 vulnerabilidades y suite completa verde. Si npm exige `--force`, no aplicar el cambio.

- [ ] **Step 4: Documentar testeo**

Agregar a `README.md`:

```markdown
## Verificación antes de publicar

```bash
npm ci
npm test
npm run test:syntax
npm audit
```

Las pruebas crean una base temporal y nunca usan `data/fabrica.db`.
```

- [ ] **Step 5: Commit**

```powershell
git add scripts/check-syntax.js package-lock.json README.md
git commit -m "chore: actualizar verificación y dependencias"
```

### Task 6: Verificación, revisión y publicación GitHub

**Files:**
- Modify: `docs/superpowers/plans/2026-08-30-preparacion-testeo-y-publicacion.md` sólo para marcar pasos ejecutados.

**Interfaces:**
- Produces: rama remota `recovery/production-2026-08-30` sin force push.

- [ ] **Step 1: Verificación completa**

```powershell
npm ci
npm test
npm run test:syntax
npm audit
git diff --check origin/master..HEAD
git status --short
```

Expected: 0 fallos, auditoría limpia y worktree limpio.

- [ ] **Step 2: Revisar el rango**

Base: `origin/master`.

Run:

```powershell
git diff --stat origin/master..HEAD
git log --oneline origin/master..HEAD
```

Corregir todos los hallazgos Critical e Important antes de publicar.

- [ ] **Step 3: Publicar sin reescribir historia**

Run:

```powershell
git push -u origin recovery/production-2026-08-30
```

Expected: rama creada en GitHub; ningún `--force`.

### Task 7: Despliegue reversible en dominio oficial

**Files:**
- Server release directory outside Git: `/home/claudeuser/releases/fabrica-pastas/<timestamp>`
- Active application: `/home/claudeuser/work/fabrica-pastas`
- Persistent data: `/home/claudeuser/work/fabrica-pastas/data`

**Interfaces:**
- Consumes: commit publicado y verificado.
- Produces: PM2 `fabrica` online en el commit nuevo o rollback al release anterior.

- [ ] **Step 1: Crear backup fresco**

Ejecutar `/home/claudeuser/backup-fabrica.sh`, archivar la fuente activa excluyendo `node_modules` y calcular SHA-256 de ambos artefactos.

- [ ] **Step 2: Preparar release aislado**

Transferir el código verificado a un directorio nuevo, excluir `.git`, `node_modules`, `data` y archivos de herramientas locales; ejecutar `npm ci --omit=dev`.

- [ ] **Step 3: Smoke remoto antes del cambio**

Crear una copia SQLite mediante `better-sqlite3.backup()`, iniciar el release en `127.0.0.1:3100` con esa copia y comprobar portada `200`, catálogo `200`, privados `401` y encabezados.

- [ ] **Step 4: Sustituir únicamente código**

Sin tocar `data/`, sincronizar los archivos del release a la carpeta activa, ejecutar `npm ci --omit=dev` y reiniciar `fabrica` con PM2 conservando `COOKIE_SEGURA=1`.

- [ ] **Step 5: Verificar dominio oficial**

Comprobar:

- `https://www.elsastredelapasta.com/` → `200`;
- `/api/publico/productos` → `200`;
- `/api/productos` sin cookie → `401`;
- seis encabezados de seguridad;
- PM2 online y cero reinicios inestables;
- `PRAGMA quick_check=ok` sobre la base operativa.

- [ ] **Step 6: Rollback automático si falla**

Ante cualquier fallo, restaurar el archivo de fuente creado en Step 1, reinstalar dependencias de esa versión, reiniciar PM2 y repetir los checks públicos.

- [ ] **Step 7: Registrar el resultado**

Actualizar el contexto `ELSASTREDELAPASTA` en Obsidian con commit, pruebas, backup, despliegue o rollback, sin secretos ni datos comerciales.
