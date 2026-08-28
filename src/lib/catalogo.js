/* La decisión de qué catálogo se usa, y de qué se hace cuando falla.
 *
 * Vive en su propio módulo, separado de `datos.js`, por una razón concreta:
 * aquí no se importa Supabase, ni la sesión, ni el JSON del catálogo. Es
 * código puro, y por eso `node --test` puede ejercitarlo sin navegador, sin
 * credenciales y sin el `import` de JSON que solo entiende Vite.
 *
 * `datos.js` lo ata a las dependencias reales. Ver `pruebas/catalogo.test.mjs`.
 */

/* EL FALLBACK SILENCIOSO SE RETIRÓ, Y ESA ES LA PARTE IMPORTANTE.

   La versión anterior era una sola línea:

     if(error || !data?.length) return catalogoLocal.map(...)

   Colapsaba tres situaciones distintas en una sola respuesta feliz:

     Supabase falló          -> catálogo local, sin avisar
     Supabase devolvió cero  -> catálogo local, sin avisar
     no hay nube ni sesión   -> catálogo local, correcto

   Las dos primeras son fallos, y devolver el JSON empaquetado los vuelve
   invisibles: la pantalla se ve idéntica. Una prueba de conexión contra
   Beyond DEV daría verde con la base vacía, con la RLS mal puesta o con las
   credenciales equivocadas. Es exactamente el modo de fallo que impedía
   validar el backend.

   Ahora las tres situaciones se separan. El fallback se conserva **solo** para
   la tercera, que es la decisión de producto de que la herramienta siga siendo
   usable sin cuenta. */

/* Un fallo del catálogo no es un error genérico: quien lo reciba tiene que
   poder decir cuál de los dos casos fue, y qué hacer. Por eso lleva `causa`. */
export class ErrorCatalogo extends Error {
  constructor(causa, detalle){
    const textos = {
      consulta: 'No se pudo leer el catálogo compartido de Supabase.',
      vacio: 'El catálogo compartido está vacío. La base responde, pero no '
           + 'tiene conceptos: es configuración incompleta, no un catálogo '
           + 'sin material.'
    };
    super(textos[causa] || 'Fallo al leer el catálogo compartido.');
    this.name = 'ErrorCatalogo';
    this.causa = causa;            // 'consulta' | 'vacio'
    this.detalle = detalle ?? null;
  }
}

/* De dónde salió el catálogo que se está usando ahora mismo.

   Existe para que una prueba —y una persona mirando la consola— pueda
   DEMOSTRAR qué fuente alimentó la pantalla, en vez de deducirlo. Sin esto,
   «la app abrió» no distingue entre leer de Supabase y leer del JSON. */
export const origenCatalogo = {
  fuente: null,      // 'local' | 'nube'
  motivo: null,      // 'sin-nube' | 'sin-sesion' | 'consulta-ok'
  filas: 0,
  en: null
};

function anotarOrigen(fuente, motivo, filas){
  origenCatalogo.fuente = fuente;
  origenCatalogo.motivo = motivo;
  origenCatalogo.filas = filas;
  origenCatalogo.en = new Date().toISOString();
  return origenCatalogo;
}

const deFila = (r) => ({
  c: r.codigo, cat: r.categoria, n: r.nombre, u: r.unidad, pu: Number(r.precio),
  t: r.taxonomia, ap: r.aplicabilidad, f: r.fuente, fe: r.fecha_ref,
  ambito: 'maestro'
});

/* La decisión, aislada de Supabase y de la sesión para poder probarla.

   No es una copia de la lógica: es LA lógica. `catalogoMaestro()` de abajo no
   hace más que atarla a las dependencias reales. Así los cuatro estados se
   ejercitan de verdad y no contra una reimplementación que puede divergir. */
export async function resolverCatalogo({ conNube, conSesion, consultar, local }){
  if(!conNube)   return { conceptos: local(), origen: anotarOrigen('local', 'sin-nube', local().length) };
  if(!conSesion) return { conceptos: local(), origen: anotarOrigen('local', 'sin-sesion', local().length) };

  const { data, error } = await consultar();

  /* Con nube y sesión, un error de Supabase es un error. No se disfraza. */
  if(error) throw new ErrorCatalogo('consulta', error);

  /* Y cero conceptos también: la base respondió, pero no hay catálogo que
     usar. Para el flujo autenticado eso es configuración incompleta. Tratarlo
     como éxito es lo que hacía que una DEV vacía pareciera funcionar. */
  if(!data || data.length === 0) throw new ErrorCatalogo('vacio');

  return { conceptos: data.map(deFila), origen: anotarOrigen('nube', 'consulta-ok', data.length) };
}

