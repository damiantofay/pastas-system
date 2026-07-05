# Portada institucional + login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la pantalla de login inmediata que hoy ve cualquier visitante de `elsastredelapasta.com` por una portada institucional pública, moviendo el sistema interno actual a su propia URL sin alterar su funcionamiento.

**Architecture:** `public/index.html` pasa a ser una página estática institucional (sin JS de negocio, sin llamadas a `/api`). El contenido que hoy vive en `index.html` (el shell del SPA que carga `app.js`) se copia sin cambios a `public/sistema.html`. `login.html` cambia una sola línea para redirigir a `/sistema.html` en vez de `/` tras un login exitoso. `server.js` no se toca: el catch-all ya sirve cualquier archivo estático primero y solo cae a `index.html` para rutas desconocidas.

**Tech Stack:** HTML/CSS estático, reutilizando `public/styles.css` (variables `--vino`, `--tinta-suave`, `--borde`, clase `.panel`). Sin frameworks, sin build.

## Global Constraints

- No modificar `auth.js`, `db.js`, ni la lógica de `/api` en `server.js` — el login y los roles admin/operador quedan exactamente igual.
- No modificar ninguna vista interna (`vender.js`, `caja.js`, `productos.js`, `stock.js`, `gastos.js`, `reportes.js`, `ajustes.js`) ni `app.js`.
- La portada institucional es solo contenido informativo (dirección, horarios, contacto, redes) — sin catálogo de productos ni precios (fuera de alcance, ver spec).
- Reusar los estilos y variables ya definidas en `public/styles.css` (no declarar una paleta de colores nueva).
- El logo ya está copiado en `public/img/logo.png` (2393×2316, fondo blanco) — usarlo tal cual, no regenerarlo.
- Datos reales a usar en la portada:
  - Nombre: El Sastre De La Pasta
  - Dirección: 9 de Julio y Alfredo Palacios, Gualeguay, Entre Ríos
  - Horarios: Martes a sábados 9 a 13hs y 17 a 21hs. Domingos y feriados 9 a 13hs.
  - WhatsApp: +54 9 3444 52-5595 → enlace `https://wa.me/5493444525595`
  - Instagram: @elsastredelapasta → enlace `https://instagram.com/elsastredelapasta`

---

### Task 1: Mover el sistema interno actual a `sistema.html`

**Files:**
- Create: `public/sistema.html` (copia exacta del `public/index.html` actual)
- Test: verificación manual por `curl` (no hay framework de tests en este proyecto)

**Interfaces:**
- Consumes: nada nuevo — el archivo sirve el mismo shell que ya carga `/js/app.js` y `/styles.css` con rutas absolutas, así que funciona igual desde cualquier URL.
- Produces: la URL `/sistema.html` queda disponible sirviendo el sistema interno completo (vender/caja/stock/etc.), para que Task 2 y Task 3 puedan redirigir ahí.

- [ ] **Step 1: Crear `public/sistema.html` con el contenido actual de `index.html`**

Contenido exacto (idéntico al `index.html` de hoy, sin ningún cambio):

```html
<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2E1F17">
<title>Fábrica de Pastas</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div id="app">
    <nav id="nav" aria-label="Menú principal"></nav>
    <main id="main">
      <div class="cargando">Cargando…</div>
    </main>
  </div>
  <div id="modal-root"></div>
  <div id="toast-root" aria-live="polite"></div>
  <script type="module" src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Levantar el servidor y verificar que `/sistema.html` sirve ese contenido**

Run:
```bash
cd /root/fabrica-pastas
npm start &
sleep 1
curl -s http://localhost:3000/sistema.html | grep -o '<script type="module" src="/js/app.js"></script>'
kill %1
```
Expected: imprime `<script type="module" src="/js/app.js"></script>` (confirma que el archivo se sirve tal cual).

- [ ] **Step 3: Commit**

No aplica todavía — el proyecto no es un repositorio git (ver Task 4, Step final, para la decisión de inicializarlo). Si el usuario decide inicializar git antes de seguir, commitear acá con:
```bash
git add public/sistema.html
git commit -m "Agregar sistema.html como shell del sistema interno"
```

---

### Task 2: Redirigir el login al sistema interno

**Files:**
- Modify: `public/login.html:48` (línea `location.href = '/';` dentro de la función `entrar()`)

**Interfaces:**
- Consumes: `public/sistema.html` de Task 1 (debe existir para que el redirect tenga destino).
- Produces: tras un login exitoso, el navegador va a `/sistema.html` en vez de `/`.

- [ ] **Step 1: Cambiar la línea de redirect**

En `public/login.html`, la función `entrar()` tiene:
```javascript
        location.href = '/';
```
Reemplazar por:
```javascript
        location.href = '/sistema.html';
```

- [ ] **Step 2: Verificar el cambio con grep**

Run:
```bash
grep -n "location.href" /root/fabrica-pastas/public/login.html
```
Expected:
```
48:        location.href = '/sistema.html';
```
(el número de línea puede variar levemente; lo importante es que ya no diga `location.href = '/';` y sí `'/sistema.html'`)

- [ ] **Step 3: Prueba manual de login**

Requiere tener un usuario admin creado. Si no existe todavía:
```bash
cd /root/fabrica-pastas
node db.js --crear-admin admin_test test1234 "Admin de prueba"
npm start &
sleep 1
```
Luego, en un navegador, ir a `http://localhost:3000/login.html`, ingresar `admin_test` / `test1234` y confirmar que redirige a `http://localhost:3000/sistema.html` mostrando el sistema (menú Vender/Caja/Stock/etc.).
```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add public/login.html
git commit -m "Redirigir el login al sistema interno en sistema.html"
```
(Solo si el proyecto ya es un repositorio git — ver Task 4.)

---

### Task 3: Reemplazar `index.html` por la portada institucional

**Files:**
- Modify: `public/index.html` (reemplazo completo del contenido)

**Interfaces:**
- Consumes: `public/img/logo.png` (ya existe en el proyecto), `public/styles.css` (variables `--vino`, `--tinta-suave`, `--borde`, clase `.panel`), y el enlace a `/login.html` (existente, sin cambios de Task 2 salvo el redirect interno).
- Produces: la URL `/` (y cualquier ruta no reconocida, vía el catch-all de `server.js`) sirve esta portada pública sin requerir sesión.

- [ ] **Step 1: Reemplazar el contenido de `public/index.html`**

Contenido completo del nuevo archivo:

```html
<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#2E1F17">
<title>El Sastre De La Pasta</title>
<link rel="stylesheet" href="/styles.css">
<style>
  body{ min-height:100vh; }
  .portada{ max-width:640px; margin:0 auto; padding:40px 20px 60px; text-align:center; }
  .portada .logo{ width:180px; height:180px; object-fit:contain; margin:0 auto 10px; display:block; }
  .portada h1{ margin-bottom:4px; }
  .portada .rubro{ color:var(--tinta-suave); margin:0 0 28px; font-weight:600; }
  .portada .panel{ text-align:left; }
  .portada .dato{ display:flex; gap:12px; align-items:flex-start; padding:12px 0; border-bottom:1px solid var(--borde); }
  .portada .dato:last-child{ border-bottom:none; }
  .portada .dato .et{ font-weight:700; color:var(--vino); min-width:110px; flex:0 0 110px; }
  .portada .dato a{ color:var(--tinta); }
  .portada .ingreso{ margin-top:34px; }
  .portada .ingreso a{ color:var(--tinta-suave); font-weight:600; font-size:.95rem; text-decoration:underline; }
</style>
</head>
<body>
  <div class="portada">
    <img class="logo" src="/img/logo.png" alt="El Sastre De La Pasta">
    <h1>El Sastre De La Pasta</h1>
    <p class="rubro">Fábrica de pastas artesanales</p>

    <div class="panel">
      <div class="dato">
        <span class="et">Dirección</span>
        <span>9 de Julio y Alfredo Palacios, Gualeguay, Entre Ríos</span>
      </div>
      <div class="dato">
        <span class="et">Horarios</span>
        <span>Martes a sábados: 9 a 13hs y 17 a 21hs<br>Domingos y feriados: 9 a 13hs</span>
      </div>
      <div class="dato">
        <span class="et">WhatsApp</span>
        <span><a href="https://wa.me/5493444525595" target="_blank" rel="noopener">+54 9 3444 52-5595</a></span>
      </div>
      <div class="dato">
        <span class="et">Instagram</span>
        <span><a href="https://instagram.com/elsastredelapasta" target="_blank" rel="noopener">@elsastredelapasta</a></span>
      </div>
    </div>

    <div class="ingreso">
      <a href="/login.html">Ingresar (administradores y empleados)</a>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Verificar que la portada se sirve sin pedir sesión**

Run:
```bash
cd /root/fabrica-pastas
npm start &
sleep 1
curl -s http://localhost:3000/ | grep -o 'El Sastre De La Pasta'
curl -s http://localhost:3000/ | grep -o 'wa.me/5493444525595'
curl -s http://localhost:3000/ | grep -o '/login.html'
kill %1
```
Expected: las tres búsquedas devuelven una coincidencia cada una (confirma que el HTML de la portada se sirve directo, sin redirect ni 401 — es HTML estático servido por `express.static`, no pasa por `requireAuth`).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "Reemplazar index.html por la portada institucional pública"
```
(Solo si el proyecto ya es un repositorio git — ver Task 4.)

---

### Task 4: Verificación end-to-end en el navegador

**Files:**
- Ninguno (solo verificación manual; no hay suite de tests automatizados en este proyecto).

**Interfaces:**
- Consumes: los tres archivos de las tasks anteriores (`index.html`, `sistema.html`, `login.html`) y el servidor (`server.js`, sin cambios).
- Produces: confirmación de que el flujo completo funciona antes de desplegar a `elsastredelapasta.com`.

- [ ] **Step 1: Levantar el servidor**

```bash
cd /root/fabrica-pastas
npm start
```

- [ ] **Step 2: Verificar la portada pública**

Abrir `http://localhost:3000/` en el navegador. Confirmar:
- Se ve el logo, "El Sastre De La Pasta", dirección, horarios, WhatsApp e Instagram, sin pedir usuario/contraseña.
- El enlace de WhatsApp abre `https://wa.me/5493444525595` en una pestaña nueva.
- El enlace de Instagram abre `https://instagram.com/elsastredelapasta` en una pestaña nueva.

- [ ] **Step 3: Verificar el ingreso al sistema**

Click en "Ingresar (administradores y empleados)". Confirmar que lleva a `/login.html`. Iniciar sesión con un usuario existente (o el `admin_test` creado en Task 2). Confirmar que redirige a `/sistema.html` y el sistema interno funciona igual que antes (menú Vender/Caja/Stock/Productos/Gastos/Costos/Ajustes).

- [ ] **Step 4: Verificar la protección de `/sistema.html` sin sesión**

Abrir una ventana de navegación privada/incógnito y visitar directamente `http://localhost:3000/sistema.html`. Confirmar que redirige a `/login.html` (mismo comportamiento de protección que existía antes, ya que `app.js` sigue llamando a `/api/me` y redirigiendo en 401).

- [ ] **Step 5: Verificar el logout**

Desde el sistema interno, hacer logout (botón "Salir"). Confirmar que lleva a `/login.html` (sin cambios respecto a hoy).

- [ ] **Step 6: Decidir sobre git e inicializar si corresponde**

El proyecto no es un repositorio git. Si el usuario quiere versionar estos cambios (recomendado antes de desplegar a producción), inicializar y hacer el primer commit:
```bash
cd /root/fabrica-pastas
git init
git add -A
git commit -m "Estado inicial: sistema de gestión + portada institucional"
```
Si el usuario prefiere no usar git, omitir este paso — los archivos ya quedaron modificados en disco.
