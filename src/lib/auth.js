import { supabase, hayNube } from './supabase.js';

const DOMINIO = (import.meta.env.VITE_DOMINIO_PERMITIDO || 'beyond-ae.com').toLowerCase();
let sesion = null;

export async function usuarioActual(){
  if(!hayNube) return null;
  if(sesion) return sesion.user;
  const { data } = await supabase.auth.getSession();
  sesion = data.session || null;
  window.__sesion = !!sesion;
  return sesion ? sesion.user : null;
}

function dominioValido(email){
  return !!email && email.toLowerCase().endsWith('@' + DOMINIO);
}

export async function entrar(){
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } }
  });
}

export async function salir(){
  await supabase.auth.signOut();
  sesion = null; window.__sesion = false;
  window.location.reload();
}

/* Restringimos el dominio también del lado del cliente para dar un mensaje
   claro, pero la restricción que cuenta es la de las políticas RLS en la base:
   un cliente se puede alterar, una política no. */
export function montarSesion(el){
  if(!el) return;
  el.classList.remove('hide');
  el.style.cssText = 'max-width:1280px;margin:0 auto;padding:14px 20px 0;display:flex;justify-content:flex-end;gap:10px;align-items:center';

  const pinta = (u) => {
    if(!hayNube){
      el.innerHTML = '<span class="chip">Modo local · sin catálogo compartido</span>';
      return;
    }
    if(!u){
      el.innerHTML = '<span class="chip">Sin sesión · los cambios se guardan en este navegador</span>'
        + '<button class="btn" id="btn-entrar">Entrar con Google</button>';
      el.querySelector('#btn-entrar').addEventListener('click', entrar);
      return;
    }
    if(!dominioValido(u.email)){
      el.innerHTML = `<span class="chip" style="color:var(--danger)">La cuenta ${u.email} no pertenece a ${DOMINIO}</span>`
        + '<button class="btn ghost" id="btn-salir">Salir</button>';
      el.querySelector('#btn-salir').addEventListener('click', salir);
      return;
    }
    el.innerHTML = `<span class="chip">${u.email}</span><button class="btn ghost" id="btn-salir">Salir</button>`;
    el.querySelector('#btn-salir').addEventListener('click', salir);
  };

  if(!hayNube){ pinta(null); return; }
  supabase.auth.onAuthStateChange((_e, s) => {
    sesion = s; window.__sesion = !!s; pinta(s ? s.user : null);
  });
  usuarioActual().then(pinta);
}
