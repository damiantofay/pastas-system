# Fábrica de Pastas — Sistema de gestión (MVP)

Sistema simple para manejar el día a día de la fábrica: **vender, controlar la caja, cargar gastos, manejar el stock de ingredientes, registrar producción y ver el costo real de cada producto**. Pensado para que lo use una persona sin conocimientos técnicos, desde una tablet, un celular o una computadora.

Esta es la **Fase 1 (núcleo operativo)**. El agente de WhatsApp y el generador de imágenes para redes quedan para una Fase 2 (ver más abajo), porque dependen de aprobaciones y servicios externos.

---

## Qué necesitás

- **Node.js 18 o superior** (recomendado **Node 22+**). Se baja gratis de https://nodejs.org
- Nada más. La base de datos es un solo archivo y no hay que instalar ningún motor aparte.

## Instalar y arrancar

Abrí una terminal en la carpeta del proyecto y corré:

```bash
npm install        # instala lo necesario (una sola vez)
npm run seed       # carga productos e ingredientes de ejemplo (opcional)
node db.js --crear-admin papa TU_CONTRASEÑA "Papá"   # crea el usuario para entrar
npm start          # arranca el sistema
```

Después abrí el navegador en:

```
http://localhost:3000
```

La primera vez te va a pedir **usuario y contraseña** (los que pusiste en el comando `--crear-admin`). Si arrancás el sistema sin haber creado ningún usuario, la propia terminal te recuerda el comando.

Si querés empezar con la base **vacía** (sin datos de ejemplo), saltá el paso `npm run seed`.

> **Para que lo use tu papá desde el celular o la tablet:** mientras la PC esté encendida y en la misma red (mismo wifi), entrá desde el otro dispositivo a `http://LA-IP-DE-LA-PC:3000` (por ejemplo `http://192.168.0.10:3000`). La IP de la PC la ves con `ipconfig` (Windows) o `ip a` (Linux).

---

## Las pantallas

- **Vender** — la principal. Tocás el producto, elegís la forma (unidad, docena, kilo o monto libre), ponés la cantidad con el teclado grande y cobrás. Descuenta el stock solo.
- **Caja** — cuánto efectivo deberías tener, total vendido, ganancia estimada y la lista de ventas del día (se pueden anular).
- **Stock** — ingredientes, registrar compras (suben el stock y fijan el precio) y registrar producción (consume la receta y suma pastas terminadas).
- **Productos** — alta/baja, precios, formas de venta, **receta** y costo con margen.
- **Gastos** — luz, gas, alquiler, etc. Se reparten en el costo de lo que se produce.
- **Costos** — cuánto cuesta hacer cada producto, desglosado en materiales, mano de obra y gastos indirectos.
- **Ajustes** — nombre del negocio, valor de la hora de trabajo y saldo inicial de caja.

---

## Cómo se calcula el costo

El costo de cada producto se arma con tres partes:

1. **Materiales** — los ingredientes de la receta, valuados al **último precio que pagaste** por cada uno.
2. **Mano de obra** — los minutos de trabajo del producto × el valor de la hora (configurable en Ajustes).
3. **Gastos indirectos** — los gastos del mes (luz, gas, etc.) repartidos por minuto de producción.

> **Nota importante sobre los gastos indirectos:** se calculan como *gastos del mes ÷ minutos producidos en el mes*. A principio de mes, con poca producción cargada, el costo indirecto por producto se ve **alto**; a medida que se carga más producción, se acomoda solo. Es el comportamiento esperado, no es un error.

---

## Usuarios y contraseñas

El sistema pide **login**. Hay dos roles:

- **Administrador** — usa todo y además da de alta usuarios y cambia contraseñas (en **Ajustes → Usuarios**).
- **Operador** — usa el sistema (vender, caja, stock, etc.) pero no maneja usuarios.

El primer usuario (administrador) se crea desde la terminal una sola vez:

```bash
node db.js --crear-admin <usuario> <contraseña> "Nombre"
```

Ese mismo comando, si el usuario ya existe, le **resetea la contraseña** y lo deja como admin (sirve si te olvidás la clave). Desde la app, el administrador puede crear el resto de los usuarios sin tocar la terminal.

> Podés usar **un solo usuario compartido** para toda la fábrica, o **uno por persona**. Para arrancar, con un admin alcanza.

---

## Ponerlo en internet con DigitalOcean (paso a paso)

Esto deja el sistema accesible desde cualquier lado (la fábrica, la casa, el reparto). Vas a necesitar una cuenta en DigitalOcean y, idealmente, un dominio (ej. `pastas.midominio.com`). Sin dominio igual funciona, pero el candado de HTTPS conviene con dominio.

**1. Crear el droplet.** En DigitalOcean: *Create → Droplet*. Elegí Ubuntu 24.04, el plan más barato (Basic, 1 GB de RAM alcanza de sobra), una región cercana, y autenticación por **clave SSH** (más segura que contraseña). Anotá la IP que te queda.

**2. Entrar por SSH** (desde tu compu):
```bash
ssh root@LA-IP-DEL-DROPLET
```

**3. Instalar Node y pm2:**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2
```

**4. Subir el proyecto.** Desde tu compu, parado en la carpeta del proyecto:
```bash
scp -r ./fabrica-pastas root@LA-IP:/root/
```
(o cloná desde tu repositorio de git si lo tenés ahí).

**5. Instalar, crear admin y arrancar con pm2** (de nuevo en el droplet):
```bash
cd /root/fabrica-pastas
npm install
node db.js --crear-admin papa TU_CONTRASEÑA "Papá"
COOKIE_SEGURA=1 pm2 start server.js --name fabrica
pm2 save
pm2 startup     # ejecutá la línea que te imprime, para que arranque solo al reiniciar
```
> `COOKIE_SEGURA=1` marca la cookie de sesión como *Secure* (solo viaja por HTTPS). Usalo cuando tengas el HTTPS del paso 7.

**6. Firewall (cerrar todo menos lo necesario):**
```bash
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

**7. Nginx + HTTPS gratis** (con dominio apuntando a la IP del droplet):
```bash
apt-get install -y nginx certbot python3-certbot-nginx
```
Creá `/etc/nginx/sites-available/fabrica` con:
```nginx
server {
    server_name pastas.midominio.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Activalo y pedí el certificado:
```bash
ln -s /etc/nginx/sites-available/fabrica /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d pastas.midominio.com
```
Certbot configura el HTTPS y la renovación automática. Listo: tu viejo entra a `https://pastas.midominio.com` y le pide usuario y contraseña.

**8. Backup automático del archivo de datos** (importante: si el droplet se rompe, esto es lo único que no se recupera). Por ejemplo, una copia diaria local con `cron` (`crontab -e`):
```bash
0 1 * * * cp /root/fabrica-pastas/data/fabrica.db /root/backups/fabrica-$(date +\%F).db
```
Mejor todavía: que ese backup se vaya **afuera** del droplet (a tu Google Drive, a DigitalOcean Spaces, o que actives los backups semanales del droplet en el panel).

### Seguridad — lo mínimo antes de exponerlo

- **No lo subas sin el login.** Ya viene incluido; solo asegurate de haber creado el usuario admin.
- Usá **HTTPS** (paso 7) para que las contraseñas no viajen en texto plano.
- Usá **claves SSH** y mantené el **firewall** activo (paso 6).
- Poné contraseñas que no sean obvias y hacé **backups** afuera del droplet.

---

## Copia de seguridad (backup)

Toda la información vive en **un solo archivo**:

```
data/fabrica.db
```

Para hacer un backup, copiá ese archivo a un pendrive o a la nube. (Si existen `fabrica.db-wal` y `fabrica.db-shm`, copialos también, aunque con el sistema cerrado alcanza con el `.db`.) Para restaurar, reemplazás el archivo y listo.

---

## Notas técnicas (para quien lo mantiene)

- **Stack:** Node + Express + SQLite. Frontend en HTML/CSS/JS puro (módulos ES), **sin paso de build**.
- **Base de datos:** usa `better-sqlite3` si compila; si no, cae automáticamente al SQLite nativo de Node (`node:sqlite`, Node 22+). Por eso `npm install` no se rompe aunque no haya compilador. El driver activo se ve en Ajustes.
- **API REST** bajo `/api` (config, sucursales, ingredientes, compras, productos, producción, gastos, ventas, caja, reportes). El frontend es solo un cliente de esa API: se puede enchufar otra cosa por encima sin tocar el negocio.
- **Multi-sucursal:** previsto en el modelo (`sucursal_id`, por defecto "Casa Central"). Hoy la interfaz trabaja con una sola sucursal; escalar a varias es agregar el selector.
- **Arranque automático (opcional):** para que quede prendido siempre en una PC, podés usar `pm2`:
  ```bash
  npm install -g pm2
  pm2 start server.js --name fabrica
  pm2 save
  pm2 startup     # seguí la instrucción que imprime
  ```

### Scripts

| Comando         | Qué hace                                  |
|-----------------|-------------------------------------------|
| `npm start`     | Arranca el servidor en el puerto 3000     |
| `npm run dev`   | Igual, recargando al guardar cambios      |
| `npm run seed`  | Carga datos de ejemplo (si la base está vacía) |

---

## Fase 2 (pendiente, no incluido)

Estos dos puntos se dejaron afuera a propósito porque dependen de servicios y aprobaciones externas, y no encajan con un sistema que arranca con un solo comando:

- **Agente de WhatsApp** para tomar pedidos / consultar precios. Requiere la API de WhatsApp (aprobación de Meta) o un proveedor tipo Twilio. La API ya está lista para enchufarlo: leería `/api/productos`, crearía ventas en `/api/ventas`, etc.
- **Generador de imágenes para redes** (placas de productos/promos). Requiere una API de generación de imágenes. Puede consumir los datos de producto y precio desde la misma API.

Cuando quieras avanzar con esto, el núcleo ya expone todo lo necesario por HTTP.
