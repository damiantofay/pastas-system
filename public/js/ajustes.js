import API from './api.js';
import { el, clear, input, select, campo, modal, cerrarModal, confirmar, toast } from './ui.js';

export async function vistaAjustes(main) {
  const cont = el('div', { class: 'vista' });
  clear(main).appendChild(cont);
  clear(cont).appendChild(el('div', { class: 'cargando', text: 'Cargando…' }));
  const cfg = await API.get('/api/config');
  pintar(cont, cfg);
}

function pintar(cont, cfg) {
  const inNombre = input({ value: cfg.nombre_negocio || '', placeholder: 'Ej: Pastas La Nonna' });
  const inHora = input({ type: 'number', step: 'any', inputmode: 'decimal', value: cfg.costo_hora || '0' });
  const inSaldo = input({ type: 'number', step: 'any', inputmode: 'decimal', value: cfg.saldo_inicial_caja || '0' });

  async function guardar() {
    try {
      await API.put('/api/config', {
        nombre_negocio: inNombre.value,
        costo_hora: parseFloat(inHora.value) || 0,
        saldo_inicial_caja: parseFloat(inSaldo.value) || 0
      });
      toast('Ajustes guardados', 'ok');
      document.title = inNombre.value || 'Fábrica de Pastas';
      const marca = document.querySelector('.nav-marca span');
      if (marca) marca.textContent = inNombre.value || 'Fábrica de Pastas';
    } catch (e) { toast(e.message, 'error'); }
  }

  clear(cont).appendChild(el('div', {}, [
    el('div', { class: 'vista-cabecera' }, [el('div', {}, [el('h1', { text: 'Ajustes' }), el('p', { text: 'Datos del negocio y valores para el cálculo de costos.' })])]),
    el('div', { class: 'panel' }, [
      campo('Nombre del negocio', inNombre),
      campo('Valor de la hora de trabajo', inHora, 'se usa para calcular la mano de obra en cada producto'),
      campo('Saldo inicial de caja', inSaldo, 'efectivo con el que arrancás el día'),
      el('div', { class: 'fila-botones' }, [el('button', { class: 'btn btn-verde btn-grande', text: 'Guardar', onClick: guardar })])
    ]),
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Cómo se calcula el costo' }),
      el('p', { class: 'ayuda', text: 'Costo de un producto = ingredientes de la receta (al último precio pagado) + mano de obra (minutos × valor de la hora) + gastos del mes repartidos por minuto de trabajo. Al principio del mes, con poca producción cargada, el costo indirecto se ve alto y se acomoda solo a medida que cargás más producción.' }),
      cfg._driver ? el('p', { class: 'ayuda', text: 'Base de datos: ' + cfg._driver }) : null
    ]),
    panelUsuarios()
  ]));
}

// --- Usuarios (solo admin) ---
function panelUsuarios() {
  const me = window.__usuario;
  if (!me || me.rol !== 'admin') return el('div');
  const cont = el('div', { class: 'panel' }, [el('div', { class: 'cargando', text: 'Cargando usuarios…' })]);

  async function recargar() {
    const usuarios = await API.get('/api/usuarios');
    const lista = usuarios.map((u) => el('div', { class: 'titem' }, [
      el('div', { class: 'titem-info' }, [
        el('div', { class: 'titem-nombre', text: `${u.nombre} (${u.usuario})` }),
        el('div', { class: 'titem-det', text: u.rol === 'admin' ? 'Administrador' : 'Operador' })
      ]),
      el('button', { class: 'btn btn-chico btn-fantasma', text: 'Cambiar clave', onClick: () => cambiarClave(u) }),
      u.id !== me.id ? el('button', { class: 'btn btn-chico btn-rojo', style: { marginLeft: '8px' }, text: 'Quitar', onClick: async () => {
        if (await confirmar(`¿Quitar a "${u.nombre}"?`, { textoOk: 'Quitar', peligro: true })) { await API.del('/api/usuarios/' + u.id); toast('Usuario quitado', 'ok'); recargar(); }
      } }) : null
    ]));
    clear(cont).appendChild(el('div', {}, [
      el('div', { class: 'vista-cabecera' }, [el('h2', { text: 'Usuarios' }), el('button', { class: 'btn btn-primario btn-chico', text: '+ Nuevo usuario', onClick: nuevoUsuario })]),
      el('div', {}, lista)
    ]));
  }

  function nuevoUsuario() {
    const inNom = input({ placeholder: 'Ej: Carlos' });
    const inUsr = input({ placeholder: 'ej: carlos', autocapitalize: 'none' });
    const inPass = input({ type: 'password', placeholder: 'mínimo 4 caracteres' });
    const inRol = select([{ value: 'operador', label: 'Operador (usa el sistema)' }, { value: 'admin', label: 'Administrador (también maneja usuarios)' }], 'operador');
    modal({
      title: 'Nuevo usuario',
      body: el('div', {}, [campo('Nombre', inNom), campo('Usuario', inUsr, 'con el que inicia sesión'), campo('Contraseña', inPass), campo('Rol', inRol)]),
      actions: [
        el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
        el('button', { class: 'btn btn-verde', text: 'Crear', onClick: async () => {
          try { await API.post('/api/usuarios', { nombre: inNom.value, usuario: inUsr.value, contraseña: inPass.value, rol: inRol.value }); cerrarModal(); toast('Usuario creado', 'ok'); recargar(); }
          catch (e) { toast(e.message, 'error'); }
        } })
      ]
    });
  }

  function cambiarClave(u) {
    const inPass = input({ type: 'password', placeholder: 'nueva contraseña' });
    modal({
      title: `Cambiar contraseña de ${u.nombre}`,
      body: campo('Nueva contraseña', inPass),
      actions: [
        el('button', { class: 'btn btn-fantasma', text: 'Cancelar', onClick: cerrarModal }),
        el('button', { class: 'btn btn-verde', text: 'Guardar', onClick: async () => {
          try { await API.put('/api/usuarios/' + u.id + '/password', { contraseña: inPass.value }); cerrarModal(); toast('Contraseña cambiada', 'ok'); }
          catch (e) { toast(e.message, 'error'); }
        } })
      ]
    });
  }

  recargar();
  return cont;
}
