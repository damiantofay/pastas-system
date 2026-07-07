# Códigos de barra en Productos y Vender

Fecha: 2026-07-07

## Contexto

El sistema de gestión (`fabrica-pastas`) tiene hoy dos pantallas relevantes para este trabajo:

- **Productos** (`public/js/productos.js` + `/api/productos*`): alta/edición manual de productos vía formulario (nombre, categoría, precios por unidad/docena/kilo, receta de ingredientes). El stock de un producto solo se repone a través de "Producción" (`/api/produccion`), que descuenta ingredientes según la receta — un mecanismo pensado para productos elaborados en la fábrica, no para mercadería comprada ya terminada.
- **Vender** (`public/js/vender.js` + `/api/ventas`): pantalla de mostrador tipo POS. Los productos se eligen tocando una ficha dentro de una grilla filtrable por categoría; según cómo esté configurada la venta del producto (`vende_unidad`, `vende_docena`, `vende_kg`, `vende_monto`) se pide cantidad o un monto libre. Los productos por kilo ya tienen un flujo de peso manual (teclado numérico) — se pesan en una balanza común y se tipea el peso.

El pedido: poder escanear un código de barras (con un lector físico USB/Bluetooth tipo "pistola", que funciona como teclado) tanto para dar de alta productos y actualizar precios en "Productos", como para agregarlos más rápido al carrito en "Vender" — reduciendo la dependencia de buscar productos a mano. Esto debe funcionar tanto para productos comprados ya con código de fábrica (reventa: bebidas, salsas, etc.) como para las pastas propias, que no traen ningún código y necesitan uno generado internamente.

## Alcance

Incluido:
- Campo de código de barras en `producto`, único por sucursal, con lookup rápido por código.
- Tipo de producto (`elaborado` / `reventa`) para diferenciar productos con receta de productos comprados terminados.
- Generación automática de un código interno (Code128) para productos elaborados que no tengan uno.
- Vista/impresión de etiqueta con el código de barras generado, en hoja imprimible por cualquier impresora común (sin impresora térmica dedicada).
- Flujo de escaneo en "Productos": alta rápida de producto nuevo, actualización rápida de precio de un producto existente, y recepción de mercadería (stock + costo) para productos de reventa.
- Flujo de escaneo en "Vender": agregar producto al carrito directo, incluyendo el caso de productos por kilo (el código identifica el producto; el peso se sigue tipeando a mano tras pesar en la balanza común).
- Mecanismo técnico de captura de escaneo (input oculto siempre enfocado) reutilizable en ambas pantallas.

Fuera de alcance (no se resuelve en esta iteración):
- Balanza con impresora de etiquetas que codifica peso/precio dentro del código de barras (el usuario confirmó que usa balanza común, sin impresora).
- Impresión del código directo sobre el envoltorio en la línea de empaquetado (mencionado como posible mejora futura, es un tema de hardware de empaquetado, no de este sistema).
- Escaneo por cámara de celular/tablet (se usa lector físico USB/Bluetooth).
- Múltiples códigos de barra por producto (variantes de tamaño/presentación se siguen resolviendo como productos separados, como ya funciona hoy).
- Liberación/reuso automático del código de un producto dado de baja.

## Diseño

### Modelo de datos (`db.js`)

Cambios a la tabla `producto`:

```sql
ALTER TABLE producto ADD COLUMN codigo_barra TEXT;
ALTER TABLE producto ADD COLUMN tipo TEXT NOT NULL DEFAULT 'elaborado'; -- 'elaborado' | 'reventa'
ALTER TABLE producto ADD COLUMN costo_compra REAL NOT NULL DEFAULT 0;  -- costo unitario, solo relevante si tipo = 'reventa'
CREATE UNIQUE INDEX idx_producto_codigo ON producto(sucursal_id, codigo_barra) WHERE codigo_barra IS NOT NULL;
```

`codigo_barra` es único **por sucursal** (no global), porque cada sucursal tiene sus propias filas de `producto` — dos sucursales pueden vender la misma bebida con el mismo EAN real sin chocar entre sí.

Nueva tabla, análoga a `compra` (que ya existe para ingredientes) pero para productos de reventa terminados:

```sql
CREATE TABLE IF NOT EXISTS recepcion_mercaderia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sucursal_id INTEGER NOT NULL DEFAULT 1,
  producto_id INTEGER NOT NULL REFERENCES producto(id),
  fecha TEXT NOT NULL,
  cantidad REAL NOT NULL,
  costo_total REAL NOT NULL,
  pagado_con TEXT NOT NULL DEFAULT 'efectivo'
);
```

Registrar una recepción suma `cantidad` a `producto.stock` y actualiza `producto.costo_compra` a `costo_total / cantidad` (último costo, mismo criterio que ya usa `ingrediente.costo_unidad_base`).

Formato de código interno generado (para productos elaborados sin código de fábrica): `PP-000001`, `PP-000002`, ... secuencial, para no colisionar nunca con un EAN/UPC real (que son siempre numéricos).

### Mecanismo de escaneo (frontend)

Un lector USB/Bluetooth tipo "pistola" emite las teclas del código muy rápido y termina con Enter, como si fuera un teclado. El mecanismo:

- Un `<input>` de texto invisible, montado una vez por vista ("Productos" y "Vender"), que el sistema mantiene siempre enfocado mientras no haya un modal abierto capturando otro campo.
- Al recibir Enter con contenido, se dispara `onScan(codigo)` y se limpia el input, quedando listo para el siguiente escaneo.
- Si el usuario toca manualmente otro campo de texto (por ejemplo para escribir un precio), el foco se queda ahí — el input de escaneo solo se re-enfoca cuando no hay ningún otro campo/modal activo.
- No hay heurística de timing entre teclas: al ser un input real, el navegador ya agrupa las pulsaciones y solo importa el Enter final.

Se implementa como un helper compartido (`public/js/scanner.js`) usado por `productos.js` y `vender.js`.

### Generación de código de barras visual (Code128, vía `bwip-js`)

Escribir a mano el algoritmo de codificación Code128 (tabla de anchos de barra) es propenso a errores difíciles de detectar sin un lector físico a mano, y un error ahí generaría etiquetas que no escanean en producción. Para evitar ese riesgo, se usa `bwip-js` (paquete npm real, JavaScript puro, sin dependencias nativas — no requiere compilador como sí ocurre opcionalmente con `better-sqlite3`), agregado como dependencia de `package.json`.

Nuevo endpoint `GET /api/productos/:id/etiqueta.png` que genera la imagen del código de barras en el momento con `bwipjs.toBuffer({ bcid: 'code128', text: codigo_barra, scale: 3, height: 10, includetext: true, textxalign: 'center' })` y la devuelve como `image/png`.

Se usa en dos lugares, ambos como `<img src="/api/productos/:id/etiqueta.png">`:
- Modal "Ver / imprimir etiqueta" en la ficha de un producto (elaborado o reventa).
- Hoja de impresión: grilla de etiquetas (nombre + precio + imagen del código) del tamaño pensado para recortar con tijera, generada con CSS de impresión (`@media print`) e impresa con el diálogo nativo del navegador — funciona con cualquier impresora común.

### Backend (`server.js`, `db.js`)

Nuevos endpoints:

- `GET /api/productos/codigo/:codigo` → busca por `codigo_barra` en la sucursal actual. 404 si no existe.
- `POST /api/productos/:id/recepcion` → body `{ cantidad, costo_total, pagado_con }`. Solo válido si `producto.tipo === 'reventa'`. Inserta en `recepcion_mercaderia`, suma stock, recalcula `costo_compra`.
- `POST /api/productos/:id/codigo` → genera y asigna un código interno `PP-xxxxxx` si el producto no tiene uno (usado al crear un elaborado sin escanear nada).

Cambios a endpoints existentes:

- `leerProductoBody` (server.js) suma lectura de `codigo_barra` (validando duplicados con mensaje claro, ej. "Ese código ya está asignado a «Coca-Cola 1.5L»") y `tipo`.
- `POST /api/productos` y `PUT /api/productos/:id` no requieren cambios estructurales más allá de aceptar estos campos nuevos — el patrón actual de merge con `cur` ya permite actualizaciones parciales (clave para el "modo rápido" de precios, que solo manda los campos de precio).
- `productoConCosto` (cálculo de costo/margen): para `tipo === 'reventa'`, el costo es `costo_compra` en vez de calcularse desde receta + mano de obra.

### Flujo en "Productos"

**Escanear un código que NO existe:**
1. Se abre el formulario "Nuevo producto" con `codigo_barra` ya completado.
2. Primero se pregunta el tipo: *Elaborado* o *Reventa*.
   - *Elaborado*: mismo formulario de hoy completo (nombre, categoría, precios, receta). Si no se escaneó código (alta manual), el sistema genera uno automáticamente al guardar.
   - *Reventa*: formulario reducido (nombre, categoría, precios de venta, forma de venta), sin receta. Al guardar, se ofrece continuar directo a "Recibí mercadería ahora" para cargar stock inicial + costo.

**Escanear un código que SÍ existe:** se abre un cartelito rápido (no el modal completo de edición), pensado para escanear muchos productos seguidos:
- *Elaborado*: nombre + los precios que ese producto vende (unidad/docena/kg), editables. Guardar actualiza vía `PUT /api/productos/:id` (solo esos campos) y vuelve a dejar el foco esperando el próximo escaneo.
- *Reventa*: mismo cartelito, sumando "cantidad recibida" y "costo total" opcionales — completarlos dispara `POST /api/productos/:id/recepcion`. Sirve para el caso real de "llegó el pedido del proveedor con lista de precios nueva": escaneás cada producto, actualizás precio y/o cargás cuánto llegó, seguís al siguiente sin cerrar nada.

**Duplicados:** si se intenta guardar un código que ya existe en otro producto de la misma sucursal, error claro que lleva al producto existente en vez de crear uno repetido.

**Etiquetas:** cada fila de producto tiene un botón "Ver / imprimir etiqueta" que abre el modal con el código de barras (generándolo primero si el producto elaborado todavía no tiene uno) y el botón de impresión de hoja en grilla.

### Flujo en "Vender"

Se mantiene la grilla de categorías/fichas tal cual (para cuando no hay código a mano o el producto no está etiquetado), sumando el escaneo como atajo:

- **Unidad o docena:** se agrega directo al carrito con cantidad 1 al precio correspondiente (misma lógica de `precioPreview` ya existente). Si el producto vende en más de un modo, aparece el mismo selector "¿Cómo lo vendés?" que ya existe al tocar la ficha.
- **Por kilo** (pastas propias o fiambre de reventa pesado): salta directo al teclado numérico de peso ya existente (`pedirCantidad` modo `kg`). El código identifica el producto; el peso se sigue tipeando a mano después de pesar en la balanza común — no cambia ese flujo.
- **Código no encontrado:** toast de error ("Producto no encontrado"), sin romper la venta en curso.
- El escaneo se ignora mientras haya un modal de cantidad/cobro abierto, para no interferir con lo que se está tipeando ahí; se reactiva al cerrarse.

### Testing / verificación

No hay suite de tests automatizados en el proyecto (verificación manual, como en trabajos anteriores documentados en `docs/superpowers/`). Plan de verificación manual tras implementar:

- Escanear (o tipear en el input oculto, para probar sin lector físico) un código nuevo en Productos → se abre alta con tipo Elaborado/Reventa, ambos flujos completos guardan bien.
- Escanear un código existente de un elaborado → cartelito rápido de precios, guarda y vuelve a esperar.
- Escanear un código existente de una reventa → cartelito con precio + recepción, cada combinación (solo precio, solo recepción, ambos) actualiza lo esperado y el margen se recalcula.
- Intentar guardar un código duplicado → error claro, sin crear producto repetido.
- En Vender: escanear un producto por unidad, por docena, por kilo, y un código inexistente — cada caso se comporta según lo descripto arriba.
- Imprimir una etiqueta y una hoja de varias etiquetas desde el navegador, confirmar que el código generado escanea correctamente con el lector físico real.
- Confirmar que escribir manualmente en un campo de texto de un formulario (nombre, precio) no es interceptado por el input de escaneo.

## Notas

Este documento reemplaza/complementa el análisis inicial de auditoría en curso (ver memoria del proyecto): es la primera pieza de trabajo funcional (no de hardening) sobre este sistema.
