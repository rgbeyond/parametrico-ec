import { supabase, hayNube } from './supabase.js';

const DOMINIO = (import.meta.env.VITE_DOMINIO_PERMITIDO || 'beyond-ae.com').toLowerCase();

export const ROLES = {
  admin:        { etiqueta: 'Administrador', desc: 'Todo, incluido crear/eliminar conceptos del maestro y asignar roles' },
  editor:       { etiqueta: 'Editor',        desc: 'Crea y edita proyectos, actualiza precio en el catálogo maestro, agrega conceptos' },
  comentarista: { etiqueta: 'Comentarista',  desc: 'Lee todo y deja comentarios' },
  lector:       { etiqueta: 'Solo lectura',  desc: 'Consulta sin modificar' }
};

export const sesion = { usuario: null, perfil: null, listo: false };

/* Sin base de datos configurada no hay cuentas ni roles: la herramienta corre
   en modo local y todo es editable, porque los datos son del propio navegador.
   Con base conectada, el rol manda y la base lo vuelve a verificar. */
export const puede = {
  get editar()     { return !hayNube || ['admin','editor'].includes(sesion.perfil?.rol); },
  get comentar()   { return !hayNube || ['admin','editor','comentarista'].includes(sesion.perfil?.rol); },
  get aprobar()    { return !hayNube || sesion.perfil?.rol === 'admin'; },
  get administrar(){ return hayNube && sesion.perfil?.rol === 'admin'; }
};

export const dominioValido = (correo) =>
  !!correo && correo.toLowerCase().endsWith('@' + DOMINIO);

export const dominio = DOMINIO;

export async function entrar(){
  if(!hayNube) throw new Error('No hay conexión a la base configurada');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      /* hd le pide a Google que muestre solo cuentas del dominio. Es comodidad,
         no seguridad: la restriccion real la aplica la base al crear el perfil. */
      queryParams: { hd: DOMINIO, prompt: 'select_account' }
    }
  });
  if(error) throw error;
}

export async function salir(){
  if(hayNube) await supabase.auth.signOut();
  sesion.usuario = null; sesion.perfil = null;
  window.location.reload();
}

async function cargarPerfil(usuario){
  if(!usuario) return null;
  const { data, error } = await supabase.from('perfiles')
    .select('id, correo, nombre, rol, activo').eq('id', usuario.id).maybeSingle();
  if(error || !data) return null;
  return data;
}

/* Resolver la sesion una sola vez y avisar a quien escuche. El perfil puede
   tardar un instante en existir: el disparador de la base lo crea al momento
   del primer ingreso, asi que reintentamos un par de veces. */
export async function iniciarSesion(){
  if(!hayNube){ sesion.listo = true; return sesion; }
  const { data } = await supabase.auth.getSession();
  sesion.usuario = data.session?.user || null;
  if(sesion.usuario){
    for(let i = 0; i < 4 && !sesion.perfil; i++){
      sesion.perfil = await cargarPerfil(sesion.usuario);
      if(!sesion.perfil) await new Promise(r => setTimeout(r, 400));
    }
  }
  sesion.listo = true;
  window.__sesion = !!sesion.perfil;
  return sesion;
}

export function alCambiarSesion(fn){
  if(!hayNube) return;
  supabase.auth.onAuthStateChange((evento) => {
    if(evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') fn(evento);
  });
}

export async function listarUsuarios(){
  const { data, error } = await supabase.from('perfiles')
    .select('id, correo, nombre, rol, activo, creado_en, ultimo_acceso')
    .order('creado_en', { ascending: true });
  if(error) throw error;
  return data || [];
}

export async function asignarRol(perfilId, rol){
  const { error } = await supabase.rpc('fn_asignar_rol', { p_perfil: perfilId, p_rol: rol });
  if(error) throw error;
}
