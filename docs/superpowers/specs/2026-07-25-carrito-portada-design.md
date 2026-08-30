# Carrito público para pedidos por WhatsApp

Fecha: 2026-07-25

## Contexto

Este diseño reemplaza exclusivamente la exclusión de carrito declarada en
`2026-07-22-catalogo-publico-portada-design.md`. El catálogo público conserva
su propósito informativo, pero permite combinar productos disponibles y abrir
WhatsApp con el detalle y total aproximado del pedido. El cierre del pedido,
el cobro y la confirmación continúan fuera del sitio.

## Contrato público

`GET /api/publico/productos` sigue sin autenticación y expone solamente:

- `nombre`, `categoria`, `precioTexto` y `disponible`;
- `precioUnidad`, `precioKg` y `precioDocena`;
- `vendeUnidad`, `vendeKg` y `vendeDocena`.

No expone identificadores internos, código de barras, receta, costos, márgenes
ni stock numérico. Los precios y modalidades en crudo son necesarios para
calcular el total del carrito en el navegador.

## Interacción

- Una ficha disponible abre el selector de modalidad cuando hay más de una.
- Cada selección agrega una unidad, kilo o docena al carrito local de la página.
- El carrito permite quitar renglones, muestra el total aproximado y genera un
  enlace `wa.me` con productos, cantidades y total.
- El carrito no reserva ni descuenta stock y no crea pedidos en la API.
- Los productos sin stock permanecen visibles pero deshabilitados.
- La búsqueda actualiza sólo los resultados para conservar foco y posición del
  cursor; los cambios de carrito actualizan únicamente su panel.

## Seguridad y verificación

La suite HTTP debe comparar el conjunto exacto de claves públicas. La prueba de
DOM debe escribir en el buscador real y comprobar que el mismo input conserva
foco y caret. Ninguna prueba utiliza la base operativa.
