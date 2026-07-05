import API from './api.js';
import { el, clear, money, numAR, input, select, campo, modal, cerrarModal, toast, confirmar } from './ui.js';

let ingredientes = [], productos = [];

export async function vistaStock(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  await recargar(cont);
}

async function recargar(cont) {
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  [ingredientes, productos] = await Promise.all([API.get('/api/ingredientes'), API.get('/api/productos')]);
  const [compras, produccion] = await Promise.all([API.get('/api/compras'), API.get('/api/produccion')]);
  pintar(cont, compras, produccion);
}

function pintar(cont, compras, produccion) {
  const accion = (txt, fn, clase = 'btn-primario') => el('button', { class: 'btn ' + clase, text: txt, onClick: fn });

  const tablaIng = ingredientes.length
    ? el('div', { class: 'tabla-wrap' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Ingrediente' }), el('th', { class: 'num', text: 'Stock' }), el('th', { class: 'num', text: 'Costo' }), el('th', { text: '' })])]),
        el('tbody', {}, ingredientes.map((i) => el('tr', {}, [
          el('td', { text: i.nombre }),
          el('td', { class: 'num' + (i.stock <= 0 ? ' pos-neg' : ''), text: `${numAR(i.stock, 2)} ${i.unidad_base}` }),
          el('td', { class: 'num', text: `${money(i.costo_unidad_base)} /${i.unidad_base}` }),
          el('td', {}, [
            el('button', { class: 'btn btn-chico btn-fantasma', text: 'Editar', onClick: () => formIngrediente(cont, i) })
          ])
        ])))
      ])])
    : el('div', { class: 'vacio', text: 'Cargá tus ingredientes (harina, huevos, ricota…).' });

  const listaCompras = compras.slice(0, 8).map((c) => el('div', { class: 'titem' }, [
    el('div', { class: 'titem-info' }, [
      el('div', { class: 'titem-nombre', text: `${c.ingrediente} · ${numAR(c.cantidad_base, 2)} ${c.unidad_base}` }),
      el('div', { class: 'titem-det', text: `${(c.fecha || '').slice(0, 16)} — ${money(c.costo_total)}` })
    ])
  ]));

  const listaProd = produccion.slice(0, 8).map((p) => el('div', { class: 'titem' }, [
    el('div', { class: 'titem-info' }, [
      el('div', { class: 'titem-nombre', text: `${p.producto} · ${numAR(p.cantidad, 2)} ${p.unidad_stock === 'kg' ? 'kg' : 'u'}` }),
      el('div', { class: 'titem-det', text: `${(p.fecha || '').slice(0, 16)}${p.empleado ? ' — ' + p.empleado : ''} · ${numAR(p.minutos, 0)} min` })
    ])
  ]));

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Stock' }), el('p', { text: 'Comprás ingredientes, producís pastas. El sistema descuenta y suma solo.' })])]),

    el('div', { class: 'panel' }, [
      el('div', { class: 'fila-botones' }, [
        accion('Registrar compra', () => formCompra(cont), 'btn-verde'),
        accion('Registrar producción', () => formProduccion(cont), 'btn-verde'),
        accion('+ Nuevo ingrediente', () => formIngrediente(cont, null), 'btn-fantasma')
      ])
    ]),

    el('div', { class: 'grid grid-2' }, [
      el('div', { class: 'panel' }, [el('h2', { text: 'Ingredientes' }), tablaIng]),
      el('div', {}, [
        el('div', { class: 'panel' }, [el('h2', { text: 'Últimas compras' }), listaCompras.length ? el('div', {}, listaCompras) : el('div', { class: 'vacio', text: 'Sin compras aún.' })]),
        el('div', { class: 'panel' }, [el('h2', { text: 'Última producción' }), listaProd.length ? el('div', {}, listaProd) : el('div', { class: 'vacio', text: 'Sin producción aún.' })])
      ])
    ])
  ]));
}

function formIngrediente(cont, ing) {
  const esNuevo = !ing;
  ing = ing || { nombre: '', unidad_base: 'kg', stock: 0, costo_unidad_base: 0 };
  const inN = input({ value: ing.nombre, placeholder: 'Ej: Harina 0000' });
  const inU = select([{ value: 'kg', label: 'Kilos (kg)' }, { value: 'l', label: 'Litros (l)' }, { value: 'unidad', label: 'Unidades' }], ing.unidad_base);
  const inS = input({ type: 'number', step: 'any', value: ing.stock, inputmode: 'decimal' });
  const inC = input({ type: 'number', step: 'any', value: ing.costo_unidad_base, inputmode: 'decimal' });

  const form = el('div', {}, [
    campo('Nombre', inN),
    campo('Se mide en', inU),
    el('div', { class: 'campos-2' }, [
      campo('Stock actual', inS, 'lo que tenés hoy'),
      campo('Costo por medida', inC, 'se actualiza al comprar')
    ])
  ]);

  async function guardar() {
    const payload = { nombre: inN.value, unidad_base: inU.value, stock: parseFloat(inS.value) || 0, costo_unidad_base: parseFloat(inC.value) || 0 };
    if (!payload.nombre.trim()) { toast('Poné un nombre', 'error'); return; }
    try {
      if (esNuevo) await API.post('/api/ingredientes', payload);
      else await API.put('/api/ingredientes/' + ing.id, payload);
      cerrarModal(); toast('Ingrediente guardado', 'ok'); recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({
    title: esNuevo ? 'Nuevo ingrediente' : 'Editar ingrediente',
    body: form,
    actions: [
      el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
      esNuevo ? null : el('button', { class: 'btn btn-rojo', text: 'Quitar', onClick: async () => {
        if (await confirmar(`¿Quitar "${ing.nombre}"?`, { textoOk: 'Quitar', peligro: true })) { await API.del('/api/ingredientes/' + ing.id); cerrarModal(); toast('Ingrediente quitado', 'ok'); recargar(cont); }
      } }),
      el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
    ].filter(Boolean)
  });
}

function formCompra(cont) {
  if (!ingredientes.length) { toast('Primero cargá un ingrediente', 'error'); return; }
  const inIng = select(ingredientes.map((i) => ({ value: i.id, label: `${i.nombre} (${i.unidad_base})` })), ingredientes[0].id);
  const inCant = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
  const inCosto = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
  const inPago = select([{ value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' }], 'efectivo');
  const uniLabel = el('span', { class: 'ayuda' });
  const refUni = () => { const i = ingredientes.find((x) => String(x.id) === String(inIng.value)); uniLabel.textContent = i ? 'en ' + i.unidad_base : ''; };
  inIng.addEventListener('change', refUni); refUni();

  const form = el('div', {}, [
    campo('Ingrediente', inIng),
    el('div', { class: 'campos-2' }, [
      campo('Cantidad comprada', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [inCant, uniLabel])),
      campo('Costo total pagado', inCosto)
    ]),
    campo('Pagado con', inPago)
  ]);

  async function guardar() {
    try {
      const r = await API.post('/api/compras', {
        ingrediente_id: inIng.value, cantidad_base: parseFloat(inCant.value) || 0,
        costo_total: parseFloat(inCosto.value) || 0, pagado_con: inPago.value
      });
      cerrarModal(); toast(`Compra cargada. Nuevo costo: ${money(r.costo_unidad_base)}`, 'ok'); recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({ title: 'Registrar compra', body: form, actions: [
    el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
    el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
  ] });
}

function formProduccion(cont) {
  if (!productos.length) { toast('Primero cargá un producto', 'error'); return; }
  const inProd = select(productos.map((p) => ({ value: p.id, label: p.nombre })), productos[0].id);
  const inCant = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
  const inEmp = input({ placeholder: 'Ej: Carlos' });
  const inMin = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: 'automático según receta' });
  const uniLabel = el('span', { class: 'ayuda' });
  const refUni = () => { const p = productos.find((x) => String(x.id) === String(inProd.value)); uniLabel.textContent = p ? (p.unidad_stock === 'kg' ? 'kilos' : 'unidades') : ''; };
  inProd.addEventListener('change', refUni); refUni();

  const form = el('div', {}, [
    campo('Producto', inProd),
    campo('Cantidad producida', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [inCant, uniLabel])),
    el('div', { class: 'campos-2' }, [
      campo('Empleado', inEmp, 'opcional'),
      campo('Minutos de trabajo', inMin, 'dejalo vacío para usar la receta')
    ])
  ]);

  async function guardar() {
    try {
      const body = { producto_id: inProd.value, cantidad: parseFloat(inCant.value) || 0, empleado: inEmp.value };
      if (inMin.value !== '') body.minutos = parseFloat(inMin.value) || 0;
      const r = await API.post('/api/produccion', body);
      cerrarModal();
      if (r.faltantes && r.faltantes.length) {
        toast('Producción cargada, pero faltó stock de: ' + r.faltantes.map((f) => f.nombre).join(', '), '');
      } else {
        toast('Producción cargada', 'ok');
      }
      recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({ title: 'Registrar producción', body: form, actions: [
    el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
    el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
  ] });
}
