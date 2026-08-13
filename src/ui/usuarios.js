import { sesion, puede, ROLES, listarUsuarios, asignarRol } from '../lib/sesion.js';
import { hayNube } from '../lib/supabase.js';

const fecha = (t) => t ? new Date(t).toLocaleDateString('es-MX',
  { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export async function pantallaUsuarios(el) {
  if (!el) return;

  if (!hayNube) {
    el.innerHTML = '<div class="note">La administración de usuarios requiere la base de datos conectada. En modo local no hay cuentas.</div>';
    return;
  }
  if (!puede.administrar) {
    el.innerHTML = '<div class="note warn">Solo un administrador puede ver y cambiar roles.</div>';
    return;
  }

  let lista = [];
  let err = '';
  try { lista = await listarUsuarios(); }
  catch (e) { err = e.message || String(e); }

  const opciones = (rol) => Object.entries(ROLES)
    .map(([k, v]) => `<option value="${k}"${k === rol ? ' selected' : ''}>${v.etiqueta}</option>`).join('');

  const admins = lista.filter((u) => u.rol === 'admin').length;

  el.innerHTML = `
    <div class="card">
      <div class="row sp" style="align-items:flex-start;margin-bottom:6px">
        <div>
          <h3>Usuarios y permisos</h3>
          <p class="muted tiny" style="margin:6px 0 0;max-width:680px">
            El perfil se crea solo la primera vez que alguien entra con su cuenta de Google.
            Los nuevos ingresan como <b style="color:var(--text-primary)">Solo lectura</b> y tú los promueves:
            es deliberado, porque quien acaba de entrar no debería poder mover precios que
            alimentan propuestas a cliente.
          </p>
        </div>
        <span class="chip">${lista.length} ${lista.length === 1 ? 'cuenta' : 'cuentas'}</span>
      </div>

      ${err ? `<div class="note warn" style="margin-top:14px"><b>No se pudo leer la lista.</b> ${err}</div>` : ''}

      <div class="scroll" style="margin-top:18px;max-height:none">
        <table class="fit">
          <colgroup><col style="width:30%"><col style="width:22%"><col style="width:18%"><col style="width:15%"><col style="width:15%"></colgroup>
          <thead><tr><th>Persona</th><th>Correo</th><th>Rol</th><th>Alta</th><th>Último acceso</th></tr></thead>
          <tbody>
            ${lista.map((u) => `<tr>
              <td class="wrap"><b style="font-size:12.5px">${u.nombre || '—'}</b>
                ${u.id === sesion.perfil.id ? '<div class="xs" style="color:var(--accent);margin-top:3px">Tú</div>' : ''}</td>
              <td class="wrap tiny muted">${u.correo}</td>
              <td>
                <select data-rol="${u.id}" ${u.id === sesion.perfil.id && admins <= 1 ? 'disabled' : ''}>${opciones(u.rol)}</select>
                ${u.id === sesion.perfil.id && admins <= 1
                  ? '<div class="xs muted" style="margin-top:4px">Eres el único administrador</div>' : ''}
              </td>
              <td class="tiny muted">${fecha(u.creado_en)}</td>
              <td class="tiny muted">${fecha(u.ultimo_acceso)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="tiny" id="umsg" style="margin-top:12px"></div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="eyebrow" style="margin-bottom:14px">Qué puede hacer cada rol</div>
      <div class="stack" style="gap:11px">
        ${Object.entries(ROLES).map(([k, v]) => `<div class="row" style="gap:12px;align-items:flex-start">
          <span class="badge ${k === 'admin' ? 'b-accent' : 'b-neutral'}" style="min-width:118px;justify-content:center"><span class="dot"></span>${v.etiqueta}</span>
          <span class="tiny muted" style="flex:1">${v.desc}</span></div>`).join('')}
      </div>
      <div class="note" style="margin-top:16px">
        El rol se verifica en la base de datos, no en el navegador. Aunque alguien
        alterara la interfaz, las políticas de acceso rechazarían la escritura.
      </div>
    </div>`;

  el.querySelectorAll('[data-rol]').forEach((s) => s.addEventListener('change', async (e) => {
    const msg = el.querySelector('#umsg');
    const id = e.target.dataset.rol;
    const rol = e.target.value;
    e.target.disabled = true;
    try {
      await asignarRol(id, rol);
      msg.innerHTML = `<span style="color:var(--success)">Rol actualizado a ${ROLES[rol].etiqueta}.</span>`;
      if (id === sesion.perfil.id) sesion.perfil.rol = rol;
      await pantallaUsuarios(el);
    } catch (err) {
      msg.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
      e.target.disabled = false;
    }
  }));
}
