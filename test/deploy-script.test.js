'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'deploy-production.sh');

function bashPath(windowsPath) {
  if (process.platform !== 'win32') return windowsPath;
  const converted = spawnSync('wsl.exe', ['wslpath', '-a', windowsPath.replaceAll('\\', '/')], { encoding: 'utf8' });
  if (converted.status !== 0) throw new Error(converted.stderr);
  return converted.stdout.trim();
}

function makeLayout() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pastas-deploy-test-'));
  const source = path.join(root, 'incoming', 'source');
  const releases = path.join(root, 'releases', 'fabrica-pastas');
  const active = path.join(root, 'work', 'fabrica-pastas-current');
  const data = path.join(root, 'work', 'fabrica-pastas', 'data');
  const backups = path.join(root, 'backups', 'deployments');
  for (const directory of [source, releases, data, backups]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(path.join(source, 'package.json'), '{"name":"fixture"}\n');
  fs.writeFileSync(path.join(source, 'package-lock.json'), '{"name":"fixture","lockfileVersion":3,"packages":{}}\n');
  fs.writeFileSync(path.join(source, 'server.js'), "'use strict';\n");
  return { root, source, releases, active, data, backups };
}

function runScript(layout, extraArgs = []) {
  const args = [
    bashPath(SCRIPT),
    '--root', bashPath(layout.root),
    '--source', bashPath(layout.source),
    '--release-id', '20260830T120000Z-abcdef1',
    '--releases-root', bashPath(layout.releases),
    '--active-link', bashPath(layout.active),
    '--data-dir', bashPath(layout.data),
    '--backup-dir', bashPath(layout.backups),
    ...extraArgs
  ];
  return spawnSync('bash', args, {
    encoding: 'utf8',
    env: { ...process.env, DB_PATH: path.join(layout.data, 'fabrica.db') }
  });
}

test('el despliegue rechaza rutas fuera del layout permitido', () => {
  const layout = makeLayout();
  try {
    const result = runScript({ ...layout, active: path.join(layout.root, 'otro', 'current') }, ['--dry-run']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /active-link debe ser/);
    assert.equal(fs.existsSync(path.join(layout.releases, '20260830T120000Z-abcdef1')), false);
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true });
  }
});

test('el dry-run valida la operación completa sin crear un release', () => {
  const layout = makeLayout();
  try {
    const result = runScript(layout, ['--dry-run']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /VALIDACIÓN OK/);
    assert.match(result.stdout, /rollback automático/);
    assert.equal(fs.existsSync(path.join(layout.releases, '20260830T120000Z-abcdef1')), false);
    assert.equal(fs.existsSync(layout.active), false);
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true });
  }
});

test('el dry-run acepta un enlace activo que apunta al release anterior', () => {
  const layout = makeLayout();
  try {
    const previous = path.join(layout.releases, '20260829T120000Z-1234567');
    fs.mkdirSync(previous);
    fs.writeFileSync(path.join(previous, 'server.js'), "'use strict';\n");
    fs.symlinkSync(previous, layout.active, process.platform === 'win32' ? 'junction' : 'dir');

    const result = runScript(layout, ['--dry-run']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /VALIDACIÓN OK/);
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true });
  }
});

test('el dry-run acepta directorios operativos todavía no creados sin crearlos', () => {
  const layout = makeLayout();
  try {
    fs.rmSync(layout.releases, { recursive: true, force: true });
    fs.rmSync(layout.backups, { recursive: true, force: true });

    const result = runScript(layout, ['--dry-run']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(layout.releases), false);
    assert.equal(fs.existsSync(layout.backups), false);
  } finally {
    fs.rmSync(layout.root, { recursive: true, force: true });
  }
});
