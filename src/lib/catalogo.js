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
      /* CUIDADO CON ESTE MENSAJE. PostgREST no devuelve error cuando la RLS
         filtra filas: devuelve `[]` con `error: null`. Así que «cero
         conceptos» tiene dos causas indistinguibles desde aquí —la tabla
         está vacía, o el rol no las ve— y el mensaje tiene que nombrar las
         dos. Decir solo «falta cargar el catálogo» manda a cargar algo que
         a lo mejor ya está cargado. */
      vacio: 'El catálogo compartido no devolvió ningún concepto. La base '
           + 'responde, así que o la tabla está vacía o la RLS no deja verla '
           + 'con este rol. En los dos casos es configuración incompleta, no '
           + 'un catálogo sin material.'
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
  fuente: null,      // 'local' | 'nube' | 'error'
  motivo: null,      // 'sin-nube' | 'sin-sesion' | 'consulta-ok' | 'consulta' | 'vacio'
  filas: 0,
  en: null
};

/* LOS CAMINOS DE ERROR TAMBIEN ANOTAN, y esto no es un detalle.

   Si al fallar no se tocara, `origenCatalogo` seguiría diciendo
   `fuente: 'nube', filas: 188` de la resolución anterior. Quien valide contra
   Beyond DEV y lo consulte después de un fallo leería exactamente lo
   contrario de lo que pasó: una señal sana con el backend caído, que es el
   mismo modo de fallo que este módulo vino a retirar, reintroducido en el
   instrumento de diagnóstico. */
function anotarOrigen(fuente, motivo, filas){
  origenCatalogo.fuente = fuente;
  origenCatalogo.motivo = motivo;
  origenCatalogo.filas = filas;
  origenCatalogo.en = new Date().toISOString();
  /* Copia: quien guarde el origen de una resolución no debe ver cómo cambia
     solo en la siguiente. El objeto exportado queda como «el último origen». */
  return { ...origenCatalogo };
}

/* Las columnas que se piden a Supabase, junto al traductor que las consume.

   Viven en el mismo sitio a propósito: si la lista de la consulta y `deFila`
   se separan, quitar una columna del `select` no rompe nada visible —`deFila`
   produce `Number(undefined)`, o sea NaN, y ese NaN entra a las sumas del
   estimador—. `datos.js` construye el `select` desde aquí. */
export const COLUMNAS = ['codigo', 'categoria', 'nombre', 'unidad', 'precio',
  'taxonomia', 'aplicabilidad', 'fuente', 'fecha_ref'];

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
  const delLocal = (motivo) => {
    const conceptos = local();
    return { conceptos, origen: anotarOrigen('local', motivo, conceptos.length) };
  };
  if(!conNube)   return delLocal('sin-nube');
  if(!conSesion) return delLocal('sin-sesion');

  const { data, error } = await consultar();

  /* Con nube y sesión, un error de Supabase es un error. No se disfraza. */
  if(error){
    anotarOrigen('error', 'consulta', 0);
    throw new ErrorCatalogo('consulta', error);
  }

  /* Y cero conceptos también: la base respondió, pero no hay catálogo que
     usar. Para el flujo autenticado eso es configuración incompleta. Tratarlo
     como éxito es lo que hacía que una DEV vacía pareciera funcionar. */
  if(!data || data.length === 0){
    anotarOrigen('error', 'vacio', 0);
    throw new ErrorCatalogo('vacio');
  }

  return { conceptos: data.map(deFila), origen: anotarOrigen('nube', 'consulta-ok', data.length) };
}

