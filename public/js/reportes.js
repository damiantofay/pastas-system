import API from './api.js';
import { el, clear, money, numAR, modal, cerrarModal } from './ui.js';

export async function vistaReportes(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(el('div', {}, [cont]));
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  const data = await API.get('/api/reportes/costos');
  pintar(cont, data);
}

function pintar(cont, data) {
  const filas = data.productos.map((p) => {
    const c = p.costo_detalle || { material: 0, mano_obra: 0, overhead: 0 };
    const margenClase = p.margen_pct == null ? '' : (p.margen_pct < 0 ? 'pos-neg' : 'pos-pos');
    return el('tr', { style: { cursor: 'pointer' }, onClick: () => detalle(p) }, [
      el('td', {}, [el('strong', { text: p.nombre }), el('div', { class: 'titem-det', text: 'Tocá para ver el detalle' })]),
      el('td', { class: 'num', text: money(c.material) }),
      el('td', { class: 'num', text: money(c.mano_obra) }),
      el('td', { class: 'num', text: money(c.overhead) }),
      el('td', { class: 'num' }, [el('strong', { text: money(p.costo_unitario) })]),
      el('td', { class: 'num', text: p.precio_referencia ? money(p.precio_referencia) : '—' }),
      el('td', { class: 'num ' + margenClase, text: p.margen_pct == null ? '—' : numAR(p.margen_pct, 1) + '%' })
    ]);
  });

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Costos' }), el('p', { text: 'Cuánto cuesta hacer cada producto y cuánto te deja.' })])]),
    el('div', { class: 'aviso', text: `Costo indirecto del mes: ${money(data.overhead_por_minuto)} por minuto de trabajo. Valor de la hora: ${money(data.costo_hora)}. Con poca producción cargada, el costo indirecto se ve alto y se acomoda durante el mes.` }),
    el('div', { class: 'panel' }, [
      el('div', { class: 'tabla-wrap' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Producto' }),
          el('th', { class: 'num', text: 'Materiales' }),
          el('th', { class: 'num', text: 'Mano obra' }),
          el('th', { class: 'num', text: 'Indirecto' }),
          el('th', { class: 'num', text: 'Costo total' }),
          el('th', { class: 'num', text: 'Precio' }),
          el('th', { class: 'num', text: 'Margen' })
        ])]),
        el('tbody', {}, filas)
      ])])
    ])
  ]));
}

function detalle(p) {
  const c = p.costo_detalle || {};
  const mats = (c.detalle_material || []).map((m) =>
    el('tr', {}, [el('td', { text: m.nombre }), el('td', { class: 'num', text: numAR(m.cantidad_base, 3) + ' ' + m.unidad_base }), el('td', { class: 'num', text: money(m.subtotal) })])
  );
  const cuerpo = el('div', {}, [
    mats.length
      ? el('div', { class: 'tabla-wrap' }, [el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Ingrediente' }), el('th', { class: 'num', text: 'Cantidad' }), el('th', { class: 'num', text: 'Costo' })])]),
          el('tbody', {}, mats)
        ])])
      : el('p', { class: 'ayuda', text: 'Este producto no tiene receta cargada.' }),
    el('div', { class: 'kpis', style: { marginTop: '14px' } }, [
      kpi('Materiales', money(c.material)),
      kpi('Mano de obra', money(c.mano_obra)),
      kpi('Indirecto', money(c.overhead)),
      kpi('Costo total', money(p.costo_unitario))
    ])
  ]);
  modal({ title: p.nombre, body: cuerpo, actions: [el('button', { class: 'btn btn-primario', text: 'Cerrar', onClick: cerrarModal })] });
}
function kpi(et, val) { return el('div', { class: 'kpi' }, [el('div', { class: 'et', text: et }), el('div', { class: 'val', text: val, style: { fontSize: '1.3rem' } })]); }
