import { sesion, puede, entrar, salir, dominio, ROLES } from '../lib/sesion.js';
import { hayNube } from '../lib/supabase.js';
import * as datos from '../lib/datos.js';
import { pantallaUsuarios } from './usuarios.js';

const fecha = (t) => t ? new Date(t).toLocaleDateString('es-MX',
  { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-MX');

/* Resumen barato de un proyecto: leemos lo que el estado ya trae guardado en
   lugar de recalcular el modelo completo de cada tarjeta. Si un proyecto no
   tiene esos datos, mostramos guiones en vez de inventar una cifra. */
function resumen(p) {
  const e = p.estado || {};
  const cfg = e.cfg || {};
  const g = (cfg.grupos || []).filter((x) => x.q > 0);
  return {
    equipos: g.reduce((a, b) => a + (+b.q || 0), 0),
    kw: g.reduce((a, b) => a + (+b.kw || 0) * (+b.q || 0), 0),
    kva: cfg.kva || null,
    kwp: cfg.kwp || 0,
    total: e.total || null,
    clase: e.clase || null
  };
}

export function montarPortada(el, { alAbrir }) {
  let filtro = '';
  let verArchivados = false;
  let vista = 'proyectos';

  const barra = () => {
    const p = sesion.perfil;
    if (!hayNube) return '<span class="chip">Modo local · sin catálogo compartido</span>';
    if (!p) return '<button class="btn" data-acc="entrar">Entrar con Google</button>';
    return `<span class="chip">${p.nombre || p.correo}</span>
      <span class="badge b-accent"><span class="dot"></span>${ROLES[p.rol]?.etiqueta || p.rol}</span>
      ${puede.administrar ? '<button class="btn ghost" data-acc="usuarios">Usuarios</button>' : ''}
      <button class="btn ghost" data-acc="salir">Salir</button>`;
  };

  const puerta = () => `
    <div class="card" style="max-width:420px;margin:88px auto;text-align:center;padding:44px 36px">
      <div class="wordmark" style="width:150px;height:50px;margin:0 auto 28px"></div>
      <p class="muted tiny" style="margin:0 0 30px">
        Estimador de CAPEX para estaciones de carga, a partir de los datos del sitio.
      </p>
      <button class="g-btn" data-acc="entrar">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        <span>Continuar con Google</span>
      </button>
      <div class="xs muted" style="margin-top:20px">Solo cuentas @${dominio}</div>
    </div>`;

  const sinPerfil = () => `
    <div class="card" style="max-width:560px;margin:60px auto">
      <h3>Tu cuenta todavía no tiene perfil</h3>
      <p class="muted tiny" style="margin-top:10px">
        Entraste como <b style="color:var(--text-primary)">${sesion.usuario?.email || ''}</b>
        pero no se creó un perfil. Casi siempre es porque la cuenta no pertenece a ${dominio}.
      </p>
      <button class="btn ghost" data-acc="salir" style="margin-top:16px">Salir</button>
    </div>`;

  const tarjeta = (p) => {
    const r = resumen(p);
    return `<div class="card" style="cursor:pointer" data-abrir="${p.id}">
      <div class="row sp" style="align-items:flex-start">
        <div style="min-width:0">
          <div style="font-weight:600;font-size:17px;letter-spacing:-.01em">${p.nombre}</div>
          <div class="tiny muted" style="margin-top:3px">${p.ubicacion || 'Sin ubicación'}</div>
        </div>
        ${p.archivado ? '<span class="badge b-neutral"><span class="dot"></span>Archivado</span>' : ''}
      </div>
      <div class="row" style="gap:8px;margin-top:14px">
        ${r.equipos ? `<span class="chip">${r.equipos} equipos</span>` : ''}
        ${r.kw ? `<span class="chip">${r.kw.toLocaleString('es-MX')} kW</span>` : ''}
        ${r.kva ? `<span class="chip">${Number(r.kva).toLocaleString('es-MX')} kVA</span>` : ''}
        ${r.kwp ? `<span class="chip">${r.kwp} kWp</span>` : ''}
      </div>
      <div class="row sp" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle)">
        <span class="tiny muted">Actualizado ${fecha(p.actualizado_en)}</span>
        ${r.total
          ? `<b style="color:var(--accent);font-variant-numeric:tabular-nums">${money(r.total)}</b>`
          : '<span class="tiny muted">Sin estimado</span>'}
      </div>
      ${r.clase ? `<div class="xs muted" style="margin-top:6px">${r.clase}</div>` : ''}
      ${puede.editar ? `<div class="row" style="gap:6px;margin-top:12px">
        <button class="btn ghost" data-dup="${p.id}" style="padding:4px 10px;font-size:11px">Duplicar</button>
        <button class="btn ghost" data-arch="${p.id}" data-val="${p.archivado ? 0 : 1}" style="padding:4px 10px;font-size:11px">${p.archivado ? 'Restaurar' : 'Archivar'}</button>
      </div>` : ''}
    </div>`;
  };

  async function pinta() {
    if (hayNube && !sesion.usuario) { el.innerHTML = puerta(); return enlaza(); }
    if (hayNube && sesion.usuario && !sesion.perfil) { el.innerHTML = sinPerfil(); return enlaza(); }

    if (vista === 'usuarios') {
      el.innerHTML = `<div class="row sp" style="margin-bottom:22px">
          <div class="wordmark"></div><div class="row">${barra()}</div></div>
        <div class="row" style="margin-bottom:18px">
          <button class="btn ghost" data-acc="volver">Volver a proyectos</button></div>
        <div id="zona-usuarios"></div>`;
      enlaza();
      await pantallaUsuarios(el.querySelector('#zona-usuarios'));
      return;
    }

    let lista = [];
    let err = '';
    try { lista = await datos.listarProyectos(); }
    catch (e) { err = e.message || String(e); }

    const vis = lista.filter((p) =>
      (verArchivados || !p.archivado) &&
      (!filtro || (p.nombre + ' ' + (p.ubicacion || '')).toLowerCase().includes(filtro.toLowerCase())));

    el.innerHTML = `
      <div class="row sp" style="margin-bottom:26px;padding-bottom:20px;border-bottom:1px solid var(--border-subtle)">
        <div>
          <div class="wordmark"></div>
          <div class="eyebrow" style="margin-top:8px">ESTIMADOR PARAMÉTRICO DE ELECTROLINERAS</div>
        </div>
        <div class="row">${barra()}</div>
      </div>

      <div class="row sp" style="margin-bottom:18px;align-items:flex-end">
        <div>
          <h2>Proyectos</h2>
          <p class="muted tiny" style="margin:6px 0 0">
            ${lista.length} ${lista.length === 1 ? 'proyecto' : 'proyectos'} en la organización.
            Todos los ven; ${puede.editar ? 'tú puedes editarlos' : 'tu rol es de consulta'}.
          </p>
        </div>
        ${puede.editar ? '<button class="btn" data-acc="nuevo">Nuevo proyecto</button>' : ''}
      </div>

      ${err ? `<div class="note warn"><b>No se pudieron leer los proyectos.</b> ${err}</div>` : ''}

      <div class="filters">
        <input type="text" id="pf" placeholder="Buscar por nombre o ubicación" value="${filtro}">
        <label class="row tiny" style="gap:7px"><input type="checkbox" id="parch" ${verArchivados ? 'checked' : ''} style="width:auto"> Ver archivados</label>
      </div>

      <div id="nuevoBox" class="hide card" style="margin-bottom:16px">
        <div class="eyebrow" style="margin-bottom:14px">Nuevo proyecto</div>
        <div class="grid g2" style="gap:12px">
          <label class="f"><span class="lb">Nombre</span><input type="text" id="nn" placeholder="Electrolinera Ejemplo — Fase 1"></label>
          <label class="f"><span class="lb">Ubicación</span><input type="text" id="nu" placeholder="Municipio, Estado"></label>
        </div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button class="btn ghost" data-acc="cancelar">Cancelar</button>
          <button class="btn" data-acc="crear">Crear y abrir</button>
        </div>
        <div class="tiny" id="nmsg" style="margin-top:10px"></div>
      </div>

      ${vis.length
        ? `<div class="grid g3" style="align-items:start">${vis.map(tarjeta).join('')}</div>`
        : `<div class="note">${lista.length
            ? 'Ningún proyecto coincide con el filtro.'
            : 'Todavía no hay proyectos. ' + (puede.editar ? 'Crea el primero, o carga el caso de Atlacomulco que ya está costeado para arrancar con algo real.' : 'Pide a un editor que cree el primero.')}
           ${!lista.length && puede.editar ? '<div style="margin-top:14px"><button class="btn ghost" data-acc="plantilla">Cargar Atlacomulco Fase 1</button></div>' : ''}</div>`}
    `;
    enlaza();
  }

  function enlaza() {
    el.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', async (e) => {
      const a = e.currentTarget.dataset.acc;
      if (a === 'entrar') return entrar().catch((err) => alert(err.message));
      if (a === 'salir') return salir();
      if (a === 'usuarios') { vista = 'usuarios'; return pinta(); }
      if (a === 'volver') { vista = 'proyectos'; return pinta(); }
      if (a === 'nuevo') {
        el.querySelector('#nuevoBox').classList.remove('hide');
        el.querySelector('#nn').focus();
        return;
      }
      if (a === 'cancelar') { el.querySelector('#nuevoBox').classList.add('hide'); return; }
      if (a === 'plantilla') {
        try { alAbrir(await datos.crearProyecto(datos.PLANTILLA_ATLACOMULCO)); }
        catch (err) { alert(err.message); }
        return;
      }
      if (a === 'crear') {
        const nombre = el.querySelector('#nn').value.trim();
        const ubicacion = el.querySelector('#nu').value.trim();
        const msg = el.querySelector('#nmsg');
        if (!nombre) {
          msg.innerHTML = '<span style="color:var(--danger)">Ponle nombre al proyecto.</span>';
          return;
        }
        try {
          const p = await datos.crearProyecto({ nombre, ubicacion, estado: {} });
          alAbrir(p);
        } catch (err) {
          msg.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
        }
      }
    }));

    el.querySelectorAll('[data-abrir]').forEach((c) => c.addEventListener('click', async (e) => {
      if (e.target.closest('[data-dup],[data-arch]')) return;
      const p = await datos.leerProyecto(e.currentTarget.dataset.abrir);
      if (p) alAbrir(p);
    }));

    el.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.dup;
      const orig = await datos.leerProyecto(id);
      const nombre = prompt('Nombre del proyecto duplicado', (orig?.nombre || '') + ' (copia)');
      if (!nombre) return;
      try { alAbrir(await datos.duplicarProyecto(id, nombre)); }
      catch (err) { alert(err.message); }
    }));

    el.querySelectorAll('[data-arch]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      await datos.archivarProyecto(e.currentTarget.dataset.arch, e.currentTarget.dataset.val === '1');
      pinta();
    }));

    const f = el.querySelector('#pf');
    if (f) {
      f.addEventListener('input', (e) => { filtro = e.target.value; });
      f.addEventListener('change', () => pinta());
    }
    const a = el.querySelector('#parch');
    if (a) a.addEventListener('change', (e) => { verArchivados = e.target.checked; pinta(); });
  }

  pinta();
  return { refrescar: pinta };
}
