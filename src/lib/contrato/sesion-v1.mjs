// COPIA de rgbeyond/beyond-platform:plataforma/contrato/sesion-v1.mjs (claude/core-f1-acceso).
// No editar aquí: se cambia en Platform y se vuelve a copiar.
// beyond-session-contract/v1 — parte ejecutable del contrato de sesión y
// navegación (docs/arquitectura/contrato-sesion-navegacion-v1.md).
//
// Sin dependencias y sin acceso al DOM salvo lo que recibe por argumento:
// cada app lo copia tal cual (o lo importa) y sus pruebas lo ejercen. Si
// una copia diverge, CONTRATO dice contra qué versión se escribió.

export const CONTRATO = "beyond-session-contract/v1";

// §4 — rutas de Platform.
export const RUTAS = Object.freeze({
  home: "/",
  acceso: "/acceso",
  callback: "/auth/callback",
  salir: "/salir",
});

// §2 — prefijos de las apps montadas bajo el origen de Platform.
export const PREFIJOS_APPS = Object.freeze({
  energia: "/energia/",
  ec: "/ec/",
});

// §5 — a dónde se puede volver tras entrar.
const PREFIJOS_VOLVER = ["/energia/", "/ec/"];
const RUTAS_PROHIBIDAS = [RUTAS.acceso, RUTAS.callback, RUTAS.salir];
const LARGO_MAXIMO = 2048;

// §4 — el destino viaja en sessionStorage, nunca dentro de redirectTo.
export const CLAVE_VOLVER = "bp:volver";

// §3 — opciones del cliente. `esPlatform` decide quién canjea callbacks.
export function opcionesAuth({ esPlatform }) {
  return {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: esPlatform === true,
  };
}

// §8 — estados de la puerta, iguales en las tres superficies.
export const ESTADOS_PUERTA = Object.freeze({
  ABIERTA: "abierta",
  SIN_SESION: "sin_sesion",
  SIN_PERFIL: "sin_perfil",
  SIN_RESPUESTA: "sin_respuesta",
  SIN_CONFIGURACION: "sin_configuracion",
});

// §8 — la decisión, pura. `perfil` es la fila de `perfiles` o null;
// `errorPerfil` es truthy si la consulta falló. Solo ABIERTA deja pasar.
export function decidirPuerta({ configurado, sesion, perfil, errorPerfil }) {
  if (!configurado) return ESTADOS_PUERTA.SIN_CONFIGURACION;
  if (!sesion) return ESTADOS_PUERTA.SIN_SESION;
  if (errorPerfil) return ESTADOS_PUERTA.SIN_RESPUESTA;
  if (!perfil || perfil.activo === false) return ESTADOS_PUERTA.SIN_PERFIL;
  return ESTADOS_PUERTA.ABIERTA;
}
export const puertaAbierta = (estado) => estado === ESTADOS_PUERTA.ABIERTA;

// §5 — devuelve la ruta relativa al origen si es un retorno permitido, o
// null. No toca window: recibe el valor tal cual llegó.
export function validarVolver(valor) {
  if (typeof valor !== "string") return null;
  if (valor.length === 0 || valor.length > LARGO_MAXIMO) return null;
  // Controles, espacios y barras invertidas no tienen lugar en una ruta
  // nuestra; los navegadores normalizan «\» a «/» y abren «/\evil».
  if (/[\u0000-\u001f\u007f\\\s]/.test(valor)) return null;
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  // Separadores, puntos y saltos de línea CODIFICADOS: URL() los deja tal
  // cual dentro del prefijo, pero un proxy o la app destino podrían
  // decodificarlos y salirse de él («/energia/..%2f..%2fauth/callback»).
  if (/%(2f|5c|2e|0d|0a|00)/i.test(valor)) return null;
  // Resolver contra un origen ficticio detecta cualquier truco que cambie
  // de host (codificaciones, «/%2f», etc.).
  let url;
  try { url = new URL(valor, "https://origen.invalid"); } catch { return null; }
  if (url.origin !== "https://origen.invalid") return null;
  if (url.username || url.password) return null;
  const ruta = url.pathname;
  if (RUTAS_PROHIBIDAS.some((p) => ruta === p || ruta.startsWith(p + "/"))) return null;
  const permitida = ruta === RUTAS.home
    || PREFIJOS_VOLVER.some((p) => ruta === p || ruta.startsWith(p));
  if (!permitida) return null;
  return ruta + url.search + url.hash;
}

// §5/§9 — la URL de la puerta para volver a `destino`. Un destino que no
// pasa la validación se omite: se entra a la Home.
export function urlAcceso(destino) {
  const v = validarVolver(destino);
  return v && v !== RUTAS.home
    ? RUTAS.acceso + "?volver=" + encodeURIComponent(v)
    : RUTAS.acceso;
}

// §9 — la ruta actual tal como se pasa a urlAcceso, desde un Location.
export function rutaActual(loc) {
  return loc.pathname + loc.search + loc.hash;
}

// §4 — URL absoluta del callback, para redirectTo / emailRedirectTo.
export function urlCallback(origen) {
  return origen.replace(/\/+$/, "") + RUTAS.callback;
}
