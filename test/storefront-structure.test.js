'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const storefrontPath = path.join(__dirname, '..', 'public', 'index.html');
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
