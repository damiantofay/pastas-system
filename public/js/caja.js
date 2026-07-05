import API from './api.js';
import { el, clear, money, numAR, input, confirmar, toast } from './ui.js';

function hoyISO() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }

const MEDIO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };

export async function vistaCaja(main) {
  let desde = hoyISO(), hasta = hoyISO();

  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);

  async function cargar() {
    clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
    const [caja, resumen, ventas] = await Promise.all([
      API.get(`/api/caja?desde=${desde}&hasta=${hasta}`),
      API.get(`/api/reportes/resumen?desde=${desde}&hasta=${hasta}`),
      API.get(`/api/ventas?desde=${desde}&hasta=${hasta}`)
    ]);
    pintar(caja, resumen, ventas);
  }

  const inDesde = input({ type: 'date', value: desde, onChange: (e) => { desde = e.target.value; } });
  const inHasta = input({ type: 'date', value: hasta, onChange: (e) => { hasta = e.target.value; } });

  function rangoControl() {
    return el('div', { class: 'panel' }, [
      el('div', { class: 'campos-2' }, [
        el('div', { class: 'campo' }, [el('label', { text: 'Desde' }), inDesde]),
        el('div', { class: 'campo' }, [el('label', { text: 'Hasta' }), inHasta])
      ]),
      el('div', { class: 'fila-botones' }, [
        el('button', { class: 'btn btn-primario', text: 'Actualizar', onClick: cargar }),
        el('button', { class: 'btn btn-fantasma', text: 'Hoy', onClick: () => { desde = hasta = hoyISO(); inDesde.value = inHasta.value = desde; cargar(); } })
      ])
    ]);
  }

  function pintar(caja, resumen, ventas) {
    const ganancia = resumen.ganancia_estimada;
    const kpis = el('div', { class: 'kpis' }, [
      kpi('Caja esperada (efectivo)', money(caja.caja_esperada), caja.caja_esperada < 0 ? 'rojo' : 'verde'),
      kpi('Total vendido', money(caja.total_ventas)),
      kpi('Ventas', numAR(caja.cantidad_ventas, 0)),
      kpi('Ganancia estimada', money(ganancia), ganancia < 0 ? 'rojo' : 'verde')
    ]);

    const desglose = el('div', { class: 'panel' }, [
      el('h2', { text: '¿De dónde viene la plata?' }),
      el('div', { class: 'tabla-wrap' }, [el('table', {}, [
        el('tbody', {}, [
          ...caja.ventas_por_medio.map((m) => fila(MEDIO_LABEL[m.medio_pago] || m.medio_pago, money(m.total), `${m.cant} ventas`)),
          fila('Gastos pagados en efectivo', '− ' + money(caja.gastos_efectivo)),
          fila('Compras pagadas en efectivo', '− ' + money(caja.compras_efectivo)),
          fila('Saldo inicial de caja', money(caja.saldo_inicial)),
          filaFuerte('Efectivo que deberías tener', money(caja.caja_esperada))
        ])
      ])])
    ]);

    const top = el('div', { class: 'panel' }, [
      el('h2', { text: 'Lo que más se vendió' }),
      resumen.top_productos.length
        ? el('div', { class: 'tabla-wrap' }, [el('table', {}, [
            el('thead', {}, [el('tr', {}, [el('th', { text: 'Producto' }), el('th', { class: 'num', text: 'Cantidad' }), el('th', { class: 'num', text: 'Vendido' })])]),
            el('tbody', {}, resumen.top_productos.map((t) =>
              el('tr', {}, [el('td', { text: t.producto }), el('td', { class: 'num', text: numAR(t.unidades, 1) }), el('td', { class: 'num', text: money(t.importe) })])
            ))
          ])])
        : el('div', { class: 'vacio', text: 'Todavía no hay ventas en este período.' })
    ]);

    const listaVentas = el('div', { class: 'panel' }, [
      el('h2', { text: 'Ventas del período' }),
      ventas.length
        ? el('div', {}, ventas.map((v) => filaVenta(v, cargar)))
        : el('div', { class: 'vacio', text: 'Sin ventas registradas.' })
    ]);

    clear(cont).appendChild(el('div', {}, [
      el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Caja' }), el('p', { text: 'Cuánta plata deberías tener y cómo se movió.' })])]),
      rangoControl(), kpis, desglose, top, listaVentas
    ]));
  }

  cargar();
}

function kpi(et, val, clase = '') {
  return el('div', { class: 'kpi ' + clase }, [el('div', { class: 'et', text: et }), el('div', { class: 'val', text: val })]);
}
function fila(a, b, c) {
  return el('tr', {}, [el('td', {}, [a, c ? el('span', { class: 'titem-det', text: '  ' + c }) : null]), el('td', { class: 'num', text: b })]);
}
function filaFuerte(a, b) {
  return el('tr', {}, [el('td', {}, [el('strong', { text: a })]), el('td', { class: 'num' }, [el('strong', { text: b })])]);
}

function filaVenta(v, recargar) {
  const hora = (v.fecha || '').slice(11, 16);
  const items = (v.items || []).map((i) => i.nombre_producto).join(', ');
  return el('div', { class: 'titem' }, [
    el('div', { class: 'titem-info' }, [
      el('div', { class: 'titem-nombre', text: `${money(v.total)} · ${MEDIO_LABEL[v.medio_pago] || v.medio_pago}` }),
      el('div', { class: 'titem-det', text: `${hora} — ${items}` })
    ]),
    el('button', {
      class: 'btn btn-chico btn-fantasma', text: 'Anular',
      onClick: async () => {
        if (await confirmar('¿Anular esta venta? Se repone el stock.', { textoOk: 'Anular', peligro: true })) {
          try { await API.del('/api/ventas/' + v.id); toast('Venta anulada', 'ok'); recargar(); }
          catch (e) { toast(e.message, 'error'); }
        }
      }
    })
  ]);
}
