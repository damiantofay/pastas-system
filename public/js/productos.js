import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar, cantLegible } from './ui.js';
import { activarEscaner } from './scanner.js';

const unidadDisplay = (u) => (u === 'kg' ? 'g' : u === 'l' ? 'ml' : 'u');
const baseToDisplay = (c, u) => (u === 'unidad' ? c : c * 1000);
const displayToBase = (v, u) => (u === 'unidad' ? v : v / 1000);

let ingredientes = [];

export async function vistaProductos(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  await recargar(cont);
  activarEscaner((codigo) => manejarEscaneo(cont, codigo));
}

async function manejarEscaneo(cont, codigo) {
  let producto = null;
  try { producto = await API.get('/api/productos/codigo/' + encodeURIComponent(codigo)); }
  catch (e) { producto = null; }
  if (producto) abrirActualizacionRapida(cont, producto);
  else abrirForm(cont, null, codigo);
}

async function recargar(cont) {
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  [ingredientes] = await Promise.all([API.get('/api/ingredientes')]);
  const productos = await API.get('/api/productos?todos=1');
  pintar(cont, productos);
}

function pintar(cont, productos) {
  const filas = productos.filter((p) => p.activo).map((p) => {
    const margenClase = p.margen_pct == null ? '' : (p.margen_pct < 0 ? 'pos-neg' : 'pos-pos');
    return el('tr', {}, [
      el('td', {}, [el('strong', { text: p.nombre }), el('div', { class: 'titem-det', text: p.categoria + ' · ' + (p.unidad_stock === 'kg' ? 'por kg' : 'por unidad') })]),
      el('td', { class: 'num', text: money(p.costo_unitario) }),
      el('td', { class: 'num', text: p.precio_referencia ? money(p.precio_referencia) : '—' }),
      el('td', { class: 'num ' + margenClase, text: p.margen_pct == null ? '—' : numAR(p.margen_pct, 1) + '%' }),
      el('td', {}, [
        el('button', { class: 'btn btn-chico btn-fantasma', text: 'Editar', onClick: () => abrirForm(cont, p) }),
        el('button', { class: 'btn btn-chico btn-rojo', text: 'Quitar', style: { marginLeft: '8px' }, onClick: async () => {
          if (await confirmar(`¿Quitar "${p.nombre}"?`, { textoOk: 'Quitar', peligro: true })) {
            await API.del('/api/productos/' + p.id); toast('Producto quitado', 'ok'); recargar(cont);
          }
        } })
      ])
    ]);
  });

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [
      el('div', {}, [el('h1', { text: 'Productos' }), el('p', { text: 'Precios, formas de venta, receta y costo de cada producto.' })]),
      el('button', { class: 'btn btn-primario', text: '+ Nuevo producto', onClick: () => abrirForm(cont, null) })
    ]),
    el('div', { class: 'panel' }, [
      productos.length
        ? el('div', { class: 'tabla-wrap' }, [el('table', {}, [
            el('thead', {}, [el('tr', {}, [el('th', { text: 'Producto' }), el('th', { class: 'num', text: 'Costo' }), el('th', { class: 'num', text: 'Precio' }), el('th', { class: 'num', text: 'Margen' }), el('th', { text: '' })])]),
            el('tbody', {}, filas)
          ])])
        : el('div', { class: 'vacio', text: 'Todavía no cargaste productos. Tocá “Nuevo producto”.' })
    ])
  ]));
}

function abrirForm(cont, p, codigoPrellenado) {
  const esNuevo = !p;
  p = p || { nombre: '', categoria: 'General', unidad_stock: 'unidad', tipo: 'elaborado', codigo_barra: codigoPrellenado || '',
    minutos_mano_obra: 0, precio_unidad: 0, precio_docena: 0, precio_kg: 0, vende_unidad: 1, vende_docena: 0, vende_kg: 0, vende_monto: 1 };

  const inNombre = input({ value: p.nombre, placeholder: 'Ej: Ravioles de ricota' });
  const inCat = input({ value: p.categoria, placeholder: 'Ej: Rellenas' });
  const inUnidad = select([{ value: 'unidad', label: 'Por unidad (se cuenta)' }, { value: 'kg', label: 'Por kilo (se pesa)' }], p.unidad_stock);
  const inTipo = select([{ value: 'elaborado', label: 'Elaborado (con receta propia)' }, { value: 'reventa', label: 'Reventa (comprado ya terminado)' }], p.tipo || 'elaborado');
  const inCodigo = input({ value: p.codigo_barra || codigoPrellenado || '', placeholder: 'Escaneá el código o dejalo vacío' });
  const inMin = input({ type: 'number', step: '0.1', value: p.minutos_mano_obra, inputmode: 'decimal' });

  const inPU = input({ type: 'number', step: '1', value: p.precio_unidad, inputmode: 'decimal' });
  const inPD = input({ type: 'number', step: '1', value: p.precio_docena, inputmode: 'decimal' });
  const inPK = input({ type: 'number', step: '1', value: p.precio_kg, inputmode: 'decimal' });

  const sw = (key, label) => {
    const chk = input({ type: 'checkbox' });
    chk.checked = !!p[key];
    const cont2 = el('label', { class: 'switch' + (chk.checked ? ' on' : '') }, [chk, label]);
    chk.addEventListener('change', () => cont2.classList.toggle('on', chk.checked));
    return { chk, node: cont2 };
  };
  const swU = sw('vende_unidad', 'Unidad'), swD = sw('vende_docena', 'Docena'), swK = sw('vende_kg', 'Kilo'), swM = sw('vende_monto', 'Monto libre');

  // Receta
  const recetaCont = el('div', {});
  const filasReceta = [];
  function addFilaReceta(ingId = '', cantBase = 0) {
    const ingOpts = ingredientes.map((i) => ({ value: i.id, label: `${i.nombre} (${i.unidad_base})` }));
    const sel = select([{ value: '', label: '— elegir ingrediente —' }, ...ingOpts], ingId);
    const ingActual = () => ingredientes.find((i) => String(i.id) === String(sel.value));
    const uniLabel = el('span', { class: 'ayuda' });
    const inCant = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
    const ing0 = ingActual();
    if (ing0) inCant.value = numAR(baseToDisplay(cantBase, ing0.unidad_base), 3).replace(/\./g, '').replace(',', '.');
    const refLabel = () => { const i = ingActual(); uniLabel.textContent = i ? unidadDisplay(i.unidad_base) + ' por ' + (inUnidad.value === 'kg' ? 'kg' : 'unidad') : ''; };
    sel.addEventListener('change', refLabel); inUnidad.addEventListener('change', refLabel); refLabel();
    const fila = el('div', { class: 'campos-2', style: { gridTemplateColumns: '1.4fr 1fr auto', alignItems: 'end', marginBottom: '10px' } }, [
      el('div', {}, [sel]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [inCant, uniLabel]),
      el('button', { class: 'btn btn-chico btn-rojo', text: '×', onClick: () => { fila.remove(); const idx = filasReceta.indexOf(reg); if (idx >= 0) filasReceta.splice(idx, 1); } })
    ]);
    const reg = { sel, inCant, ingActual };
    filasReceta.push(reg);
    recetaCont.appendChild(fila);
  }

  const recetaSeccion = el('div', {}, [
    el('h3', { text: 'Receta', style: { marginTop: '8px' } }),
    el('p', { class: 'ayuda', text: 'Cuánto de cada ingrediente lleva 1 ' + (p.unidad_stock === 'kg' ? 'kilo' : 'unidad') + '. Sirve para calcular el costo y descontar stock al producir.' }),
    recetaCont,
    el('button', { class: 'btn btn-fantasma btn-chico', text: '+ Agregar ingrediente', onClick: () => addFilaReceta(), style: { marginTop: '6px' } })
  ]);
  const actualizarVisibilidadReceta = () => { recetaSeccion.style.display = inTipo.value === 'reventa' ? 'none' : ''; };
  inTipo.addEventListener('change', actualizarVisibilidadReceta);

  const form = el('div', {}, [
    campo('Nombre', inNombre),
    el('div', { class: 'campos-2' }, [campo('Categoría', inCat), campo('Se vende', inUnidad)]),
    el('div', { class: 'campos-2' }, [campo('Tipo', inTipo), campo('Código de barras', inCodigo, 'Escaneá con el lector, o dejalo vacío (se genera solo en elaborados).')]),
    campo('Formas de venta', el('div', { class: 'switches' }, [swU.node, swD.node, swK.node, swM.node]), 'Marcá todas las que uses para este producto.'),
    el('div', { class: 'campos-2' }, [
      campo('Precio por unidad', inPU),
      campo('Precio por docena', inPD)
    ]),
    el('div', { class: 'campos-2' }, [
      campo('Precio por kilo', inPK),
      campo('Minutos de trabajo', inMin, `por ${p.unidad_stock === 'kg' ? 'kilo' : 'unidad'} producido`)
    ]),
    recetaSeccion
  ]);
  actualizarVisibilidadReceta();

  // cargar receta existente
  if (!esNuevo) {
    API.get('/api/productos/' + p.id).then((full) => {
      (full.receta || []).forEach((r) => addFilaReceta(r.ingrediente_id, r.cantidad_base));
      if (!full.receta || !full.receta.length) addFilaReceta();
    });
  } else {
    addFilaReceta();
  }

  async function guardar() {
    const receta = filasReceta.map((f) => {
      const ing = f.ingActual();
      const val = parseFloat(f.inCant.value) || 0;
      if (!ing || val <= 0) return null;
      return { ingrediente_id: ing.id, cantidad_base: displayToBase(val, ing.unidad_base) };
    }).filter(Boolean);

    const payload = {
      nombre: inNombre.value, categoria: inCat.value, unidad_stock: inUnidad.value,
      tipo: inTipo.value, codigo_barra: inCodigo.value.trim() || null,
      minutos_mano_obra: parseFloat(inMin.value) || 0,
      precio_unidad: parseFloat(inPU.value) || 0,
      precio_docena: parseFloat(inPD.value) || 0,
      precio_kg: parseFloat(inPK.value) || 0,
      vende_unidad: swU.chk.checked, vende_docena: swD.chk.checked, vende_kg: swK.chk.checked, vende_monto: swM.chk.checked,
      receta: inTipo.value === 'reventa' ? [] : receta
    };
    if (!payload.nombre.trim()) { toast('Poné un nombre', 'error'); return; }
    try {
      if (esNuevo) await API.post('/api/productos', payload);
      else await API.put('/api/productos/' + p.id, payload);
      cerrarModal(); toast('Producto guardado', 'ok'); recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({
    title: esNuevo ? 'Nuevo producto' : 'Editar producto',
    body: form,
    actions: [
      el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
      el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
    ]
  });
}

function abrirActualizacionRapida(cont, p) {
  const inPU = p.vende_unidad ? input({ type: 'number', step: '1', value: p.precio_unidad, inputmode: 'decimal' }) : null;
  const inPD = p.vende_docena ? input({ type: 'number', step: '1', value: p.precio_docena, inputmode: 'decimal' }) : null;
  const inPK = p.vende_kg ? input({ type: 'number', step: '1', value: p.precio_kg, inputmode: 'decimal' }) : null;
  const esReventa = p.tipo === 'reventa';
  const inCant = esReventa ? input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' }) : null;
  const inCosto = esReventa ? input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' }) : null;

  const campos = [];
  if (inPU) campos.push(campo('Precio por unidad', inPU));
  if (inPD) campos.push(campo('Precio por docena', inPD));
  if (inPK) campos.push(campo('Precio por kilo', inPK));
  if (esReventa) {
    campos.push(el('h3', { text: 'Recibí mercadería (opcional)', style: { marginTop: '8px' } }));
    campos.push(el('div', { class: 'campos-2' }, [campo('Cantidad recibida', inCant), campo('Costo total', inCosto)]));
  }

  async function guardar() {
    try {
      const payloadPrecio = {};
      if (inPU) payloadPrecio.precio_unidad = parseFloat(inPU.value) || 0;
      if (inPD) payloadPrecio.precio_docena = parseFloat(inPD.value) || 0;
      if (inPK) payloadPrecio.precio_kg = parseFloat(inPK.value) || 0;
      if (Object.keys(payloadPrecio).length) await API.put('/api/productos/' + p.id, payloadPrecio);

      const cant = inCant ? parseFloat(inCant.value) || 0 : 0;
      const costo = inCosto ? parseFloat(inCosto.value) || 0 : 0;
      if (cant > 0) await API.post('/api/productos/' + p.id + '/recepcion', { cantidad: cant, costo_total: costo });

      cerrarModal();
      toast(`"${p.nombre}" actualizado`, 'ok');
      recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({
    title: p.nombre,
    body: el('div', {}, campos),
    actions: [
      el('button', { class: 'btn btn-fantasma', text: 'Cerrar', onClick: cerrarModal }),
      el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
    ]
  });
}
