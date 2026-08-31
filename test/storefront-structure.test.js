'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const storefrontPath = path.join(__dirname, '..', 'public', 'index.html');

test('la portada pública ofrece el shell semántico y los accesos principales', () => {
  const dom = new JSDOM(fs.readFileSync(storefrontPath, 'utf8'));
  const { document } = dom.window;

  assert.ok(document.querySelector('header.storefront-header'));
  assert.ok(document.querySelector('main'));
  assert.ok(document.querySelector('.storefront-hero'));
  assert.ok(document.querySelector('section#productos'));
  assert.ok(document.querySelector('section#informacion'));
  assert.ok(document.querySelector('footer'));
  assert.ok(document.querySelector('link[rel="stylesheet"][href="/portada.css"]'));
  assert.ok(document.querySelector('a.storefront-whatsapp[href^="https://wa.me/5493444525595"]'));
  assert.equal(document.querySelectorAll('a[href="/login.html"]').length, 1);

  dom.window.close();
});
