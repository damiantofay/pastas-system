import API from './api.js';
import { el, clear, money, input, select, campo, modal, cerrarModal, toast, confirmar } from './ui.js';

const CATEGORIAS = [
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'gas', label: 'Gas' },
  { value: 'agua', label: 'Agua' },
  { value: 'telefono', label: 'Teléfono / Internet' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'sueldos', label: 'Sueldos' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'otros', label: 'Otros' }
];
const labelCat = (v) => (CATEGORIAS.find((c) => c.value === v) || { label: v }).label;

export async function vistaGastos(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  await recargar(cont);
}

async function recargar(cont) {
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  const gastos = await API.get('/api/gastos');
  pintar(cont, gastos);
}

function pintar(cont, gastos) {
  const lista = gastos.length
    ? el('div', {}, gastos.map((g) => el('div', { class: 'titem' }, [
        el('div', { class: 'titem-info' }, [
          el('div', { class: 'titem-nombre', text: `${money(g.importe)} · ${labelCat(g.categoria)}` }),
          el('div', { class: 'titem-det', text: `${(g.fecha || '').slice(0, 16)}${g.descripcion ? ' — ' + g.descripcion : ''} · ${g.pagado_con}` })
        ]),
        el('button', { class: 'btn btn-chico btn-fantasma', text: 'Borrar', onClick: async () => {
          if (await confirmar('¿Borrar este gasto?', { textoOk: 'Borrar', peligro: true })) { await API.del('/api/gastos/' + g.id); toast('Gasto borrado', 'ok'); recargar(cont); }
        } })
      ])))
    : el('div', { class: 'vacio', text: 'Todavía no cargaste gastos.' });

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [
      el('div', {}, [el('h1', { text: 'Gastos' }), el('p', { text: 'Luz, gas, alquiler… Se reparten en el costo de lo que producís.' })]),
      el('button', { class: 'btn btn-primario', text: '+ Nuevo gasto', onClick: () => form(cont) })
    ]),
    el('div', { class: 'panel' }, [lista])
  ]));
}

function form(cont) {
  const inCat = select(CATEGORIAS, 'electricidad');
  const inImp = input({ type: 'number', step: 'any', inputmode: 'decimal', placeholder: '0' });
  const inDesc = input({ placeholder: 'Ej: Factura de mayo' });
  const inPago = select([{ value: 'efectivo', label: 'Efectivo' }, { value: 'transferencia', label: 'Transferencia' }], 'efectivo');

  const cuerpo = el('div', {}, [
    campo('Categoría', inCat),
    campo('Importe', inImp),
    campo('Descripción', inDesc, 'opcional'),
    campo('Pagado con', inPago)
  ]);

  async function guardar() {
    try {
      await API.post('/api/gastos', { categoria: inCat.value, importe: parseFloat(inImp.value) || 0, descripcion: inDesc.value, pagado_con: inPago.value });
      cerrarModal(); toast('Gasto cargado', 'ok'); recargar(cont);
    } catch (e) { toast(e.message, 'error'); }
  }

  modal({ title: 'Nuevo gasto', body: cuerpo, actions: [
    el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
    el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: guardar })
  ] });
}
