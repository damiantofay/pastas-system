# Storefront público de El Sastre de la Pasta — Diseño

**Fecha:** 2026-08-31  
**Contexto:** `ELSASTREDELAPASTA`  
**Estado:** aprobado por mandato de liderazgo autónomo del propietario

## Objetivo

Transformar la portada pública en una tienda artesanal contemporánea, clara y confiable, con prioridad móvil y foco en convertir visitas en consultas o pedidos por WhatsApp. La mejora no cambia precios, productos, disponibilidad, horarios, dirección ni reglas de negocio.

## Diagnóstico

La portada desplegada concentra todo en una columna angosta, repite la marca, presenta la información operativa antes que la propuesta de valor, usa una grilla de productos sin jerarquía y deja grandes áreas vacías en escritorio. En móvil se percibe como un formulario largo. El catálogo funciona, pero el frente no comunica calidad artesanal ni guía la acción principal.

## Dirección visual

Se adopta un lenguaje **artesanal contemporáneo**:

- fondo cálido tipo papel y superficies crema;
- verde oscuro como acción y terracota como acento;
- tipografía editorial para títulos y sans serif para operación;
- logo existente tratado como sello de marca, sin inventar identidad nueva;
- textura y formas construidas con CSS, sin fotos ficticias de productos;
- tarjetas amplias y legibles, con estados de disponibilidad inequívocos.

## Arquitectura de la página

1. **Cabecera compacta:** marca, enlaces a catálogo e información y CTA de WhatsApp.
2. **Hero:** propuesta de valor, ubicación, horario y dos acciones: ver catálogo y pedir por WhatsApp.
3. **Franja de confianza:** elaboración artesanal, ubicación y canal de pedido, expresados sólo con datos confirmados.
4. **Catálogo:** título, explicación breve, buscador accesible, filtros y grilla responsive.
5. **Información:** dirección, horarios, WhatsApp e Instagram en una sección secundaria.
6. **Footer:** marca y acceso discreto para personal.
7. **Acción móvil fija:** WhatsApp accesible sin tapar contenido.

## Comportamiento del catálogo

Se conserva la API y el carrito existentes. El renderer agrega estructura semántica y clases específicas de storefront. Los productos disponibles continúan abriendo el selector/agregado; los no disponibles permanecen inactivos y muestran su estado. Buscar conserva foco y cursor. El carrito conserva cálculo y envío por WhatsApp.

## Responsive y accesibilidad

- ancho máximo de contenido: `1180px`;
- hero de dos columnas en escritorio y una en móvil;
- grilla de 3 columnas amplias, 2 en tablet y 1–2 en móvil según ancho útil;
- targets táctiles mínimos de 44 px;
- landmarks `header`, `main`, `section`, `footer` y etiquetas de buscador;
- foco visible, contraste alto y soporte de movimiento reducido;
- el CTA móvil respeta `safe-area-inset-bottom`.

## Límites

- No crear productos, promociones, fotografías, testimonios ni afirmaciones comerciales no verificadas.
- No modificar el sistema interno en esta entrega.
- No cambiar endpoints, base SQLite ni autenticación.
- El alias `www` es un trabajo DNS/certificado separado.

## Verificación

- pruebas DOM sobre estructura, accesibilidad, búsqueda, foco y estados de producto;
- sintaxis completa y auditoría de dependencias;
- screenshots reales en escritorio y móvil;
- smoke local y, tras publicación, despliegue reversible con los controles existentes.

