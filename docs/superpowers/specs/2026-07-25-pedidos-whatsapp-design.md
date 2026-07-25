# Pedidos por WhatsApp — Fase 2 (spec)

## Qué problema resuelve

Hoy un cliente pide por WhatsApp/teléfono y alguien de la fábrica anota a mano. La idea: un agente de WhatsApp (número propio, atendido por IA) toma el pedido, arma la combinación pedida (pasta + salsa, + opcional pan/queso/reventa) según lo que haya en stock **ahora mismo** en este sistema, cotiza, y deja el pedido cargado para que el personal lo vea y prepare. Cuando se entrega, el sistema le pide feedback al cliente.

## Alcance de esta primera versión

- El cliente habla con el agente por WhatsApp. El agente arma el pedido y lo **postea en este sistema** (no manda mensajes internos aparte).
- El personal ve los pedidos entrantes en una pantalla nueva del sistema (**Pedidos**), igual que ya ve Vender/Stock/etc.
- El personal cambia el estado del pedido (nuevo → en preparación → listo → entregado) desde esa misma pantalla.
- Al marcar **entregado**, se dispara (vía cron de OpenClaw) un mensaje de WhatsApp al cliente pidiendo feedback.
- La composición de la "porción" se arma según **stock real** de `producto` (categorías Pastas/Salsas/Panadería/Quesos/Reventa), usando los precios ya cargados — **no** se toca el precio especial por porción todavía (eso lo configura Damian después en Ajustes, queda como campo pendiente).
- Crear un pedido **no descuenta stock automáticamente** — solo avisa si algo no alcanza (mismo criterio que ya usa `/api/produccion` con `faltantes`). El descuento real de stock lo sigue haciendo el personal como hoy, al registrar producción o venta. (Evita reservas dobles / lógica de bloqueo compleja en esta v1.)

## Qué NO entra en esta versión

- Precio especial de "porción combinada" (por ahora se suma el precio de cada componente).
- Pagos online / cobro por WhatsApp.
- Reparto/logística de entrega.
- Multi-sucursal para pedidos (usa `sucursal_id = 1` fijo, igual que el resto del sistema hoy).

## Modelo de datos nuevo

```sql
CREATE TABLE pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sucursal_id INTEGER NOT NULL DEFAULT 1,
  fecha TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  cliente_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'nuevo', -- nuevo|en_preparacion|listo|entregado|cancelado
  notas TEXT,
  total REAL NOT NULL DEFAULT 0,
  fecha_entregado TEXT
);

CREATE TABLE pedido_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  descripcion TEXT NOT NULL,   -- ej: "Ravioles de ricota + salsa fileto"
  detalle TEXT,                -- JSON: [{producto_id, nombre, cantidad_base}]
  importe REAL NOT NULL
);
```

## API nueva (mismo patrón que el resto: `h()`, `suc(req)`, transacciones)

- `GET /api/pedidos?estado=&desde=&hasta=` — lista.
- `POST /api/pedidos` — crea pedido con items; devuelve `faltantes` si algo escasea (no bloquea).
- `PUT /api/pedidos/:id/estado` — cambia estado; si pasa a `entregado`, guarda `fecha_entregado` (esto es lo que dispara el cron de feedback desde afuera).
- `GET /api/pedidos/porciones/opciones` — devuelve productos activos agrupados por categoría (Pastas/Salsas/Panadería/Quesos/Reventa) con stock y precio, para que el agente sepa qué ofrecer.

## Frontend nuevo

- Pantalla **Pedidos** (`public/js/pedidos.js`), mismo estilo que `stock.js`/`vender.js`: lista de pedidos con filtro por estado, cada uno con botón para avanzar estado.
- Entrada en el nav (`app.js`) junto a las demás vistas.

## Seguridad encontrada de paso (fix incluido en este plan)

`GET /api/config` devuelve **todas** las claves de la tabla `config`, incluyendo `session_secret` en texto plano, a cualquier usuario logueado. Se arregla filtrando la respuesta a la misma lista blanca que ya usa el `PUT` (`nombre_negocio`, `costo_hora`, `saldo_inicial_caja`, `moneda`).

## Agente de WhatsApp (fuera de este repo)

Vive en OpenClaw, como agente nuevo aislado (mismo patrón que `guaycito`): workspace propio, `tools.fs.workspaceOnly: true`, sin exec/browser, con `read` + un tool de HTTP hacia `elsastredelapasta.com/api` (login con usuario de servicio propio, no el de admin humano) para leer stock y crear pedidos. Necesita su propio número de WhatsApp (SIM argentina, como se está gestionando para Guaycito).
