'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const storefrontPath = path.join(__dirname, '..', 'public', 'index.html');
const sharedCssPath = path.join(__dirname, '..', 'public', 'styles.css');
const storefrontCssPath = path.join(__dirname, '..', 'public', 'portada.css');

test('la portada pública ofrece el shell semántico y los accesos principales', () => {
  const dom = new JSDOM(fs.readFileSync(storefrontPath, 'utf8'));
  const { document } = dom.window;

  assert.ok(document.querySelector('header.storefront-header'));
  assert.ok(document.querySelector('main'));
  assert.ok(document.querySelector('.storefront-hero'));
  assert.ok(document.querySelector('section#productos'));
  assert.ok(document.querySelector('#productos #catalogo'));
  assert.ok(document.querySelector('section#informacion'));
  assert.ok(document.querySelector('footer'));
  assert.ok(document.querySelector('link[rel="stylesheet"][href="/portada.css"]'));
  assert.ok(document.querySelector('a.storefront-whatsapp[href^="https://wa.me/5493444525595"]'));
  assert.equal(document.querySelectorAll('a[href="/login.html"]').length, 1);
  assert.ok(document.querySelector('script[type="module"][src="/js/portada.js"]'));

  dom.window.close();
});

test('los CTA verdes conservan texto blanco y el botón secundario conserva texto verde', () => {
  const dom = new JSDOM(`<!doctype html><style>${fs.readFileSync(storefrontCssPath, 'utf8')}</style>`);
  const rules = [...dom.window.document.styleSheets[0].cssRules];
  const ruleFor = (selector) => rules.find((rule) =>
    rule.selectorText?.split(',').map((item) => item.trim()).includes(selector));

  const buttonRule = ruleFor('.storefront-page a.storefront-button');
  const mobileRule = ruleFor('.storefront-page a.storefront-mobile-cta');
  const secondaryRule = ruleFor('.storefront-page a.storefront-button--secondary');

  assert.equal(buttonRule?.style.color, '#fff');
  assert.equal(mobileRule?.style.color, '#fff');
  assert.equal(secondaryRule?.style.color, 'var(--storefront-green)');
  assert.equal(secondaryRule?.style.background, 'transparent');
  assert.ok(rules.indexOf(secondaryRule) > rules.indexOf(buttonRule));

  dom.window.close();
});

test('el control para quitar productos conserva un área táctil de al menos 44 por 44 px en la portada', () => {
  const dom = new JSDOM(`<!doctype html>
    <style>${fs.readFileSync(sharedCssPath, 'utf8')}</style>
    <style>${fs.readFileSync(storefrontCssPath, 'utf8')}</style>
    <body class="storefront-page"><button class="titem-quitar">×</button></body>`);
  const button = dom.window.document.querySelector('.titem-quitar');
  const styles = dom.window.getComputedStyle(button);

  assert.ok(Number.parseFloat(styles.width) >= 44, `ancho computado: ${styles.width}`);
  assert.ok(Number.parseFloat(styles.height) >= 44, `alto computado: ${styles.height}`);

  dom.window.close();
});
