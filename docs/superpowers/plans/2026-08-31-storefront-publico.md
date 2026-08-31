# Storefront público Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la portada pública como una tienda artesanal contemporánea, mobile-first y orientada a pedidos por WhatsApp sin alterar datos ni reglas de negocio.

**Architecture:** `public/index.html` define el shell semántico; un nuevo `public/portada.css` aísla el diseño público del sistema interno; `public/js/portada.js` conserva la lógica y expone clases/estructura específicas para catálogo y carrito. Las pruebas JSDOM y HTTP reales verifican el contrato.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js `node:test`, JSDOM, Express y SQLite descartable.

**Spec:** `docs/superpowers/specs/2026-08-31-storefront-publico-design.md`

## Global Constraints

- No modificar API, datos, autenticación ni reglas comerciales.
- No inventar fotos, productos, promociones ni afirmaciones.
- Preservar búsqueda, foco/caret, filtros, carrito y WhatsApp.
- Mantener el CSS público aislado del sistema interno.
- Verificar escritorio y móvil antes de desplegar.

---

### Task 1: Shell semántico y sistema visual público

**Files:**
- Modify: `public/index.html`
- Create: `public/portada.css`
- Create: `test/storefront-structure.test.js`

**Interfaces:**
- Consumes: `#catalogo`, `/img/logo.png`, `/img/mascota.png` y `/js/portada.js`.
- Produces: landmarks, anclas `#productos`/`#informacion`, CTA WhatsApp y clases `.storefront-*`.

- [x] **Step 1: Escribir la prueba estructural que falla**

Comprobar con JSDOM que existen `header`, `main`, hero, sección `#productos`, sección `#informacion`, `footer`, enlace a `portada.css`, CTA WhatsApp y un solo acceso interno.

- [x] **Step 2: Ejecutar RED**

Run: `node --test test/storefront-structure.test.js`  
Expected: FAIL porque el shell actual no contiene esos landmarks.

- [x] **Step 3: Implementar HTML y CSS mínimos**

Reescribir el shell público y crear el sistema visual responsive descrito en el spec, manteniendo exactamente los datos confirmados.

- [x] **Step 4: Ejecutar GREEN y commit**

Run: `node --test test/storefront-structure.test.js`  
Expected: PASS.

### Task 2: Catálogo y carrito integrados al storefront

**Files:**
- Modify: `public/js/portada.js`
- Modify: `public/portada.css`
- Modify: `test/portada-dom.test.js`

**Interfaces:**
- Consumes: respuesta real de `/api/publico/productos` y helpers de `ui.js`.
- Produces: `.catalog-toolbar`, `.product-grid`, `.product-card`, `.product-card__status` y `.order-card` sin cambiar el contrato del API.

- [x] **Step 1: Agregar pruebas DOM que fallen**

Verificar etiqueta accesible del buscador, estructura de toolbar/grilla, categoría visible, estado agotado, y preservación del foco/caret.

- [x] **Step 2: Ejecutar RED**

Run: `node --test --test-concurrency=1 test/portada-dom.test.js`  
Expected: FAIL por ausencia de la nueva estructura.

- [x] **Step 3: Implementar renderer y estilos**

Mantener las funciones de filtro, agregado, totales y WhatsApp; cambiar sólo el markup generado y sus clases.

- [x] **Step 4: Ejecutar GREEN y commit**

Run: `node --test --test-concurrency=1 test/portada-dom.test.js`  
Expected: PASS.

### Task 3: Gate completo y validación visual

**Files:**
- Modify: `docs/superpowers/plans/2026-08-31-storefront-publico.md`

**Interfaces:**
- Consumes: storefront completo.
- Produces: evidencia de calidad local y visual lista para publicación.

- [ ] **Step 1: Ejecutar gate completo**

Run: `npm test && npm run test:syntax && npm audit --audit-level=low && git diff --check`  
Expected: 0 fallos y 0 vulnerabilidades.

- [ ] **Step 2: Ejecutar smoke local**

Iniciar el fixture con SQLite descartable y verificar portada `200`, catálogo `200` y APIs privadas `401`.

- [ ] **Step 3: Revisar en navegador**

Capturar escritorio y móvil, comprobar que no haya overflow, contenido duplicado, elementos cortados ni errores de consola.

- [ ] **Step 4: Publicar y desplegar**

Publicar una rama sin force y ejecutar `scripts/deploy-production.sh` con backup, smoke, release inmutable y rollback automático.

- [ ] **Step 5: Registrar evidencia**

Actualizar Obsidian en el contexto `ELSASTREDELAPASTA` y generalizar únicamente aprendizajes saneados.
