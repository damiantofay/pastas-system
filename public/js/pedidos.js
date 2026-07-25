import API from './api.js';
import { el, clear, money, toast } from './ui.js';

const ETIQUETA_ESTADO = {
  nuevo: 'Nuevo',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};
const SIGUIENTE_ESTADO = {
  nuevo: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado'
};

let filtroEstado = '';

export async function vistaPedidos(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  await recargar(cont);
}

async function recargar(cont) {
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  const qs = filtroEstado ? ('?estado=' + filtroEstado) : '';
  const pedidos = await API.get('/api/pedidos' + qs);
  pintar(cont, pedidos);
}

function pintar(cont, pedidos) {
  const chips = ['', 'nuevo', 'en_preparacion', 'listo', 'entregado', 'cancelado'].map((e) =>
    el('button', {
      class: 'chip' + (filtroEstado === e ? ' activo' : ''),
      text: e ? ETIQUETA_ESTADO[e] : 'Todos',
      onClick: () => { filtroEstado = e; recargar(cont); }
    })
  );

  const lista = pedidos.length
    ? pedidos.map((p) => tarjetaPedido(p, cont))
    : [el('div', { class: 'vacio', text: 'No hay pedidos.' })];

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [
      el('h1', { text: 'Pedidos' }),
      el('p', { text: 'Pedidos que llegan por WhatsApp. Marcá el estado a medida que avanzan.' })
    ])]),
    el('div', { class: 'chips' }, chips),
    el('div', { class: 'grid grid-2' }, lista)
  ]));
}

function tarjetaPedido(p, cont) {
  const items = (p.items || []).map((it) => el('div', { class: 'titem' }, [
    el('div', { class: 'titem-info' }, [el('div', { class: 'titem-nombre', text: it.descripcion })]),
    el('div', { class: 'titem-importe', text: money(it.importe) })
  ]));

  const siguiente = SIGUIENTE_ESTADO[p.estado];

  return el('div', { class: 'panel' }, [
    el('div', { class: 'vista-cabecera' }, [
      el('div', {}, [
        el('h3', { text: p.cliente_nombre || p.cliente_telefono }),
        el('div', { class: 'titem-det', text: p.cliente_telefono + ' · ' + (p.fecha || '').slice(0, 16) })
      ]),
      el('span', { class: 'chip activo', text: ETIQUETA_ESTADO[p.estado] || p.estado })
    ]),
    el('div', {}, items),
    p.notas ? el('div', { class: 'aviso', text: p.notas }) : null,
    el('div', { class: 'ticket-total' }, [el('span', { text: 'Total' }), el('span', { text: money(p.total) })]),
    el('div', { class: 'fila-botones' }, [
      siguiente ? el('button', {
        class: 'btn btn-verde', text: 'Marcar ' + ETIQUETA_ESTADO[siguiente],
        onClick: () => cambiarEstado(p.id, siguiente, cont)
      }) : null,
      (p.estado !== 'cancelado' && p.estado !== 'entregado') ? el('button', {
        class: 'btn btn-rojo btn-fantasma', text: 'Cancelar',
        onClick: () => cambiarEstado(p.id, 'cancelado', cont)
      }) : null
    ])
  ]);
}

async function cambiarEstado(id, estado, cont) {
  try {
    await API.put('/api/pedidos/' + id + '/estado', { estado });
    toast('Pedido actualizado', 'ok');
    recargar(cont);
  } catch (e) { toast(e.message, 'error'); }
}
