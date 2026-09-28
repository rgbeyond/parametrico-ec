// COPIA de rgbeyond/beyond-platform:plataforma/contrato/adaptador-v1.mjs (claude/core-f1-acceso).
// No editar aquí: se cambia en Platform y se vuelve a copiar.
// beyond-session-contract/v1 — adaptador de referencia para las apps
// montadas bajo Platform (§6, §7, §8, §9 del contrato).
//
// No importa supabase-js: recibe el cliente ya creado con
// `opcionesAuth({ esPlatform: false })`. Así se prueba en Node con un
// cliente falso, y cada app decide cómo empaqueta su dependencia.
//
// Lo que NO hace, a propósito: no inicia sesión, no canjea códigos, no
// cierra sesión. Eso es de Platform. Un adaptador que validara y renovara
// la sesión común es un adaptador permitido; uno que la emitiera sería una
// segunda puerta.

import { decidirPuerta, ESTADOS_PUERTA, urlAcceso, rutaActual, RUTAS } from "./sesion-v1.mjs";

export const COLUMNAS_PERFIL = "id, correo, nombre, rol, activo";

// Lee el perfil de la sesión. Distingue «no hay fila» (null) de «no pude
// preguntar» (error): el segundo nunca se trata como el primero.
//
// En el PRIMER ingreso el perfil lo crea un disparador de la base
// (fn_alta_perfil) y puede llegar un instante después que la sesión: sin
// fila y sin error se reintenta (review F1, mismo criterio que las apps
// standalone). Un error no se reintenta aquí: lo decide la pantalla.
export const REINTENTOS_PERFIL = 3;
export const ESPERA_PERFIL_MS = 400;
export async function cargarPerfil(supabase, usuarioId,
  { reintentos = REINTENTOS_PERFIL, espera = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let intento = 0; ; intento++) {
    const { data, error } = await supabase
      .from("perfiles").select(COLUMNAS_PERFIL).eq("id", usuarioId).maybeSingle();
    if (error) return { perfil: null, errorPerfil: error };
    if (data || intento >= reintentos) return { perfil: data ?? null, errorPerfil: null };
    await espera(ESPERA_PERFIL_MS);
  }
}

// La decisión completa de la puerta para una superficie. `supabase` null
// significa build sin configuración: se cierra.
export async function consultarPuerta(supabase, opcionesPerfil) {
  if (!supabase) {
    return { estado: decidirPuerta({ configurado: false }), sesion: null, perfil: null };
  }
  let sesion = null;
  try {
    ({ data: { session: sesion } } = await supabase.auth.getSession());
  } catch (e) {
    return { estado: ESTADOS_PUERTA.SIN_RESPUESTA, sesion: null, perfil: null, error: e };
  }
  if (!sesion) {
    return { estado: decidirPuerta({ configurado: true, sesion: null }), sesion: null, perfil: null };
  }
  const { perfil, errorPerfil } = await cargarPerfil(supabase, sesion.user.id, opcionesPerfil);
  return {
    estado: decidirPuerta({ configurado: true, sesion, perfil, errorPerfil }),
    sesion, perfil, error: errorPerfil ?? null,
  };
}

// §8/§9 — para una app: si la puerta no abre por falta de sesión o de
// perfil, va al acceso de Platform con retorno a esta misma ruta, con
// replace. Si no abre por configuración o por un fallo de consulta, NO
// redirige (sería un bucle contra el mismo fallo): devuelve el estado y la
// app muestra el error. Solo con estado ABIERTA se pinta contenido.
export async function exigirAcceso(supabase, loc = globalThis.location) {
  const r = await consultarPuerta(supabase);
  if (r.estado === ESTADOS_PUERTA.SIN_SESION || r.estado === ESTADOS_PUERTA.SIN_PERFIL) {
    loc.replace(urlAcceso(rutaActual(loc)));
  }
  return r;
}

// §6/§8 — mantener la decisión viva:
// - una salida o expiración en esta pestaña o en otra (SIGNED_OUT) lleva al
//   acceso con retorno;
// - al llegar el `expires_at` de la sesión se vuelve a decidir. auth-js
//   guarda un refresh fallido 60 s (REFRESH_FAILURE_COOLDOWN_MS) y en ese
//   lapso no emite SIGNED_OUT aunque el token ya venció: la puerta no puede
//   depender solo del evento;
// - al volver la pestaña a primer plano se vuelve a decidir (un temporizador
//   de una pestaña en segundo plano puede retrasarse);
// - volver desde el bfcache recarga.
// `reloj` e `doc` existen para las pruebas. Devuelve la función que desuscribe.
export function vigilarSesion(supabase, loc = globalThis.location, win = globalThis,
  { reloj = globalThis, doc = globalThis.document, margenMs = 1000 } = {}) {
  let temporizador = null;
  const decidir = async () => {
    const r = await consultarPuerta(supabase);
    if (r.estado === ESTADOS_PUERTA.SIN_SESION || r.estado === ESTADOS_PUERTA.SIN_PERFIL) {
      loc.replace(urlAcceso(rutaActual(loc)));
    }
  };
  const programar = (sesion) => {
    if (temporizador) reloj.clearTimeout(temporizador);
    temporizador = null;
    const vence = sesion?.expires_at ? sesion.expires_at * 1000 : null;
    if (!vence) return;
    const espera = Math.max(0, vence - Date.now()) + margenMs;
    temporizador = reloj.setTimeout(decidir, espera);
  };
  const alCambiar = (_evento, sesion) => {
    if (!sesion) { loc.replace(urlAcceso(rutaActual(loc))); return; }
    programar(sesion);
  };
  const sub = supabase?.auth.onAuthStateChange(alCambiar);
  const alMostrar = (ev) => { if (ev.persisted) loc.reload(); };
  const alVisible = () => (doc?.visibilityState === "visible" ? decidir() : undefined);
  win.addEventListener?.("pageshow", alMostrar);
  doc?.addEventListener?.("visibilitychange", alVisible);
  return () => {
    sub?.data?.subscription?.unsubscribe();
    if (temporizador) reloj.clearTimeout(temporizador);
    win.removeEventListener?.("pageshow", alMostrar);
    doc?.removeEventListener?.("visibilitychange", alVisible);
  };
}

// §7 — la única salida: la de Platform.
export function salir(loc = globalThis.location) {
  loc.assign(RUTAS.salir);
}

// §9 — el retorno al shell común.
export const URL_PLATFORM = RUTAS.home;
