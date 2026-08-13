import versiones from '../data/versiones.json';

/* La bitácora vive en un archivo del repositorio, no en la base de datos, por
   una razón: describe el código. Así cada entrada se despliega junto con el
   cambio que documenta y no puede anunciar una versión que no existe. */

const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/* El mediodía evita que la zona horaria corra la fecha un día hacia atrás. */
const fechaTxt = (f) => f
  ? new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
  : 'Fecha no registrada';

const TIPOS = {
  mayor: 'Cambio mayor',
  menor: 'Cambio menor',
  parche: 'Parche',
  inicial: 'Versión inicial'
};

const conDetalle = (x) => !!(x.agregado || x.cambiado || x.corregido || x.nota);

function bloque(titulo, items) {
  if (!items || !items.length) return '';
  return `<div style="margin-top:18px">
    <div class="eyebrow" style="margin-bottom:9px">${titulo}</div>
    <ul style="margin:0;padding-left:19px">${items.map((x) => `<li style="margin-bottom:7px">${esc(x)}</li>`).join('')}</ul>
  </div>`;
}

function indice() {
  return `<div class="row sp" style="align-items:flex-start;gap:16px;margin-bottom:18px">
      <div>
        <h3>Bitácora de versiones</h3>
        <p class="tiny muted" style="margin:7px 0 0">Numeración por versionado semántico: mayor punto menor punto parche.
        El primer número sólo cambia si se rompe la compatibilidad de los proyectos guardados.</p>
      </div>
      <button class="btn ghost" data-cerrar style="padding:5px 12px;font-size:12px;flex:0 0 auto">Cerrar</button>
    </div>
    <table>
      <thead><tr><th>Versión</th><th>Fecha</th><th>Cambios</th><th></th></tr></thead>
      <tbody>${versiones.map((x) => `<tr>
        <td style="white-space:nowrap"><b>${esc(x.v)}</b><div class="xs muted">${esc(TIPOS[x.tipo] || x.tipo || '')}</div></td>
        <td class="tiny" style="white-space:nowrap">${fechaTxt(x.fecha)}</td>
        <td class="tiny wrap">${esc(x.resumen)}</td>
        <td style="text-align:right">${conDetalle(x)
          ? `<button class="btn ghost" data-ver="${esc(x.v)}" style="padding:4px 10px;font-size:11px;white-space:nowrap">Ver detalle</button>`
          : ''}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function detalle(x) {
  return `<div class="row sp" style="align-items:flex-start;gap:16px">
      <div>
        <h3>Versión ${esc(x.v)}</h3>
        <p class="tiny muted" style="margin:7px 0 0">${fechaTxt(x.fecha)} · ${esc(TIPOS[x.tipo] || x.tipo || '')}${
          x.commits && x.commits.length ? ' · commits ' + x.commits.map(esc).join(', ') : ''}</p>
      </div>
      <button class="btn ghost" data-cerrar style="padding:5px 12px;font-size:12px;flex:0 0 auto">Cerrar</button>
    </div>
    <p class="tiny" style="margin:16px 0 0">${esc(x.resumen)}</p>
    ${bloque('Agregado', x.agregado)}
    ${bloque('Cambiado', x.cambiado)}
    ${bloque('Corregido', x.corregido)}
    ${x.nota ? `<div class="note" style="margin-top:20px">${esc(x.nota)}</div>` : ''}
    <div style="margin-top:22px"><button class="btn ghost" data-volver style="padding:5px 12px;font-size:12px">Volver a la bitácora</button></div>`;
}

export function abrirBitacora() {
  let abierta = null;

  const fondo = document.createElement('div');
  fondo.className = 'modal';
  fondo.setAttribute('role', 'dialog');
  fondo.setAttribute('aria-modal', 'true');
  fondo.setAttribute('aria-label', 'Bitácora de versiones');

  const alTeclear = (e) => { if (e.key === 'Escape') cerrar(); };
  function cerrar() {
    document.removeEventListener('keydown', alTeclear);
    fondo.remove();
  }

  function pinta() {
    fondo.innerHTML = `<div class="modal-card">${abierta ? detalle(abierta) : indice()}</div>`;
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    const volver = fondo.querySelector('[data-volver]');
    if (volver) volver.addEventListener('click', () => { abierta = null; pinta(); });
    fondo.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', (e) => {
      abierta = versiones.find((x) => x.v === e.currentTarget.dataset.ver) || null;
      pinta();
    }));
    const foco = fondo.querySelector('.modal-card');
    if (foco) foco.focus();
  }

  /* Cerrar sólo cuando el clic cae fuera de la tarjeta, no al arrastrar dentro. */
  fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(); });
  document.addEventListener('keydown', alTeclear);
  document.body.appendChild(fondo);
  pinta();
}
