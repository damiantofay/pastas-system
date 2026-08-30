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
