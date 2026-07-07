// Captura de lectores de código de barra USB/Bluetooth (funcionan como
// teclado: tipean el código muy rápido y terminan con Enter). Se mantiene
// un input invisible siempre enfocado mientras no haya un modal abierto,
// para no depender de heurísticas de tiempo entre teclas.

let inputEl = null;
let callback = null;
let intervaloId = null;

function existeModalAbierto() {
  const root = document.getElementById('modal-root');
  return !!(root && root.firstChild);
}

function crearInput() {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.setAttribute('aria-hidden', 'true');
  inp.tabIndex = -1;
  inp.autocomplete = 'off';
  inp.style.position = 'fixed';
  inp.style.top = '0';
  inp.style.left = '-9999px';
  inp.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = inp.value.trim();
    inp.value = '';
    // Se ignora mientras haya un modal abierto (cantidad, cobro, formularios)
    // para no interrumpir lo que se está cargando ahí.
    if (valor && callback && !existeModalAbierto()) callback(valor);
  });
  document.body.appendChild(inp);
  return inp;
}

function reenfocar() {
  if (!inputEl || !callback) return;
  if (existeModalAbierto()) return;
  if (document.activeElement !== inputEl) inputEl.focus({ preventScroll: true });
}

export function activarEscaner(onScan) {
  callback = onScan;
  if (!inputEl) inputEl = crearInput();
  if (!intervaloId) intervaloId = setInterval(reenfocar, 400);
  reenfocar();
}

export function desactivarEscaner() {
  callback = null;
}
