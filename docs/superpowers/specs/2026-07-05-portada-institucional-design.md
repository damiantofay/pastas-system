# Portada institucional + login para El Sastre De La Pasta

Fecha: 2026-07-05

## Contexto

El sistema de gestión (`fabrica-pastas`) ya está desplegado en `elsastredelapasta.com`. Hoy, al entrar al dominio, `public/index.html` carga el sistema interno (vender, caja, stock, etc.), y `app.js` inmediatamente pide `/api/me`; si no hay sesión, responde 401 y redirige a `/login.html`. En la práctica, un visitante sin cuenta solo ve "Cargando…" y termina en el login, sin ver nada del negocio.

El pedido: reutilizar este mismo sitio (no crear un proyecto aparte) agregando una portada pública que muestre información institucional de la fábrica, dejando el acceso al sistema interno (para administradores y empleados) detrás de un botón de login, usando el mecanismo de autenticación que ya existe (roles `admin` / `operador` en `auth.js` y `db.js`).

## Alcance

Incluido:
- Nueva portada pública en la raíz del dominio con datos institucionales reales del negocio.
- Reubicación del sistema interno actual a una URL propia, sin alterar su funcionamiento.
- Ajuste del redirect post-login para que apunte al sistema interno.
- Uso del logo provisto (`public/img/logo.png`).

Fuera de alcance (no se toca en este trabajo):
- Catálogo de productos con precios en la portada (el usuario eligió arrancar solo con contenido institucional).
- Cambios al esquema de roles, permisos o al mecanismo de login (sigue habiendo un solo formulario de login para admin y operador).
- Cambios a las vistas internas (vender, caja, stock, productos, gastos, reportes, ajustes).
- Fase 2 (WhatsApp, generador de imágenes) — sin cambios.

## Diseño

### Estructura de archivos

- **`public/index.html`** (nuevo contenido): portada institucional pública, sin autenticación.
- **`public/sistema.html`** (nuevo archivo, contenido = el `index.html` actual sin modificar): shell del sistema interno que carga `app.js` como hoy.
- **`public/login.html`**: sin cambios de contenido; solo cambia la línea de redirect tras un login exitoso, de `location.href = '/'` a `location.href = '/sistema.html'`.
- **`public/img/logo.png`**: logo ya copiado al proyecto (2393×2316, fondo blanco).
- **`server.js`**: sin cambios de lógica. El catch-all `app.get('*', ...)` sigue sirviendo `index.html` para rutas no reconocidas — ahora eso muestra la portada pública en vez del sistema, que es el comportamiento correcto para visitantes.

### Contenido de la portada (`index.html`)

Institucional, estático, en español, reutilizando la paleta y estilos ya definidos en `public/styles.css` (fondo `#2E1F17`, tipografías y variables ya usadas en `login.html`) para que se sienta parte del mismo sistema:

- Logo (`/img/logo.png`) y nombre del negocio: **El Sastre De La Pasta**.
- Dirección: 9 de Julio y Alfredo Palacios, Gualeguay, Entre Ríos.
- Horarios: Martes a Sábados 9 a 13hs y 17 a 21hs. Domingos y feriados 9 a 13hs.
- Contacto: enlace de WhatsApp a `https://wa.me/5493444525595`.
- Instagram: enlace a `https://instagram.com/elsastredelapasta` (`@elsastredelapasta`).
- Botón **"Ingresar"** que lleva a `/login.html`, visualmente secundario (no es el foco de la portada, es un acceso para el equipo).

No lleva JS de negocio ni llama a `/api` — es HTML/CSS estático, no requiere sesión.

### Flujo resultante

1. Visitante entra a `elsastredelapasta.com` → ve la portada institucional (sin login).
2. Si es cliente: lee info, usa WhatsApp/Instagram. Fin.
3. Si es admin/empleado: toca "Ingresar" → `/login.html` (sin cambios visuales ni de comportamiento) → login exitoso → redirige a `/sistema.html` → ahí sigue funcionando exactamente igual que hoy (vender, caja, stock, etc., con los roles admin/operador ya existentes).
4. Si alguien navega directo a `/sistema.html` sin sesión, `app.js` sigue haciendo su chequeo de `/api/me`, recibe 401 y redirige a `/login.html` — mismo comportamiento de protección que existe hoy, solo que ahora vive en otra URL.

### Testing / verificación

Como es HTML/CSS estático más un cambio de una línea en JS, la verificación es manual (no hay suite de tests automatizados en el proyecto):
- Levantar el servidor local (`npm start`) y verificar en el navegador:
  - `/` muestra la portada institucional sin pedir login.
  - Botón "Ingresar" lleva a `/login.html`.
  - Login con un usuario existente redirige a `/sistema.html` y el sistema funciona como antes.
  - Acceder a `/sistema.html` sin sesión (navegación privada) redirige a `/login.html`.
  - Logout desde el sistema interno sigue llevando a `/login.html` (sin cambios, ya que `salir()` en `app.js` no toca `/`).

## Notas

El proyecto no es un repositorio git todavía, así que este documento no se pudo commitear; queda solo en disco. Si más adelante se quiere versionado, se puede inicializar git en `/root/fabrica-pastas`.
