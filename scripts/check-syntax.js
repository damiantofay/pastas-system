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
