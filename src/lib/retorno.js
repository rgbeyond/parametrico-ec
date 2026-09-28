/* Retorno a la ruta original después de iniciar sesión (issue #9).
   ================================================================

   EL PROBLEMA QUE RESUELVE
   ------------------------
   Quien abre la liga del portal sin sesión tenía que entrar al Paramétrico,
   buscar el proyecto y volver a pegar la liga a mano: OAuth regresa a
   `window.location.origin` y la ruta original se perdía en el camino.

   La alternativa habría sido que OAuth regresara directo a la ruta del portal,
   pero eso obliga a dar de alta cada ruta —y cada Deploy Preview— en las
   Redirect URLs de Supabase. Aquí no se toca esa configuración: la ruta se
   guarda un momento en `sessionStorage`, OAuth sigue volviendo a la raíz, y la
   raíz la consume antes de montar nada.

   POR QUÉ `sessionStorage` Y NO OTRA COSA
   ---------------------------------------
   Sobrevive al viaje a Google y de regreso —misma pestaña, mismo origen— y
   muere al cerrar la pestaña. No queremos que una ruta pendiente de hace tres
   días secuestre un arranque.

   POR QUÉ ESTO ES UNA LISTA BLANCA Y NO UN REDIRECT GENÉRICO
   ----------------------------------------------------------
   Un «vuelve a donde estabas» que acepte cualquier destino es un redirect
   abierto: sirve para mandar a alguien a un sitio ajeno desde una liga que
   parece nuestra. Aquí sólo se admiten rutas RELATIVAS cuyo pathname esté en
   `RUTAS_PERMITIDAS`. Todo lo demás —`https://…`, `//otro-dominio`,
   `javascript:`, rutas con contrabarra— se rechaza.

   El fragmento (`#…`) se descarta a propósito: es donde Supabase deja el
   token del retorno de OAuth, y no tiene por qué viajar a ninguna parte.
*/

export const LLAVE_RETORNO = 'parametrico:returnTo';

/* Las únicas rutas a las que se puede volver. Crece sólo si alguien lo decide
   a propósito: una lista que crece sola deja de ser una lista blanca. */
export const RUTAS_PERMITIDAS = ['/portal-inversionista.html'];

/* Base inventada para poder analizar una ruta relativa con el mismo analizador
   que usa el navegador. Si al resolver contra ella el origen cambia, es que la
   ruta no era relativa: eso es exactamente lo que hay que rechazar. */
const BASE = 'http://retorno.local';

export function rutaValida(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  /* Tiene que empezar con una sola barra. `//host` es una URL con origen
     propio y `\` lo normalizan algunos navegadores a `/`, así que ninguno de
     los dos pasa. */
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  if (s.includes('\\')) return null;
  // Caracteres de control: nada que hacer con ellos en una ruta.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(s)) return null;

  let u;
  try { u = new URL(s, BASE); } catch { return null; }
  if (u.origin !== BASE) return null;
  if (!RUTAS_PERMITIDAS.includes(u.pathname)) return null;

  // Se conservan los parámetros —ahí va el proyecto— y se tira el fragmento.
  return u.pathname + u.search;
}

/* Guarda la ruta a la que habrá que volver. Devuelve lo que guardó, o `null`
   si la ruta no era admisible: guardar algo que después se va a rechazar sólo
   sirve para confundir a quien lea el almacenamiento. */
export function guardarRetorno(ruta, almacen) {
  const destino = rutaValida(ruta);
  if (!destino) return null;
  try { almacen.setItem(LLAVE_RETORNO, destino); } catch { return null; }
  return destino;
}

/* Lee la ruta pendiente y la CONSUME. El borrado ocurre siempre, incluso si lo
   guardado resulta inválido: una llave envenenada no puede quedarse esperando
   al siguiente arranque, y una válida no puede dispararse dos veces. Esa es la
   defensa contra el bucle. */
export function tomarRetorno(almacen) {
  let guardado = null;
  try {
    guardado = almacen.getItem(LLAVE_RETORNO);
    almacen.removeItem(LLAVE_RETORNO);
  } catch { return null; }
  return rutaValida(guardado);
}

/* La ruta actual, en la forma que se guarda. Sin origen y sin fragmento. */
export function rutaActual(ubicacion) {
  return `${ubicacion.pathname}${ubicacion.search}`;
}
