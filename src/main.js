import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import logoUrl from './assets/logos/beyond-orange.png';
import { VERSION_TXT } from './lib/version.js';
import { iniciarSesion, alCambiarSesion, sesion, bajoBeyond }
  from './lib/sesion.js';
import { hayNube } from './lib/supabase.js';
import { montarPortada } from './ui/portada.js';
import { abrirProyecto } from './lib/contexto.js';

/* app.js fija esta misma variable cuando se carga, pero eso pasa hasta que
   se abre un proyecto. La portada la necesita desde el primer render. */
document.documentElement.style.setProperty('--logo', `url("${logoUrl}")`);

/* La bitácora se importa sólo al abrirla: no tiene por qué pesar en el arranque. */
const pieVersion = document.getElementById('appver');
if (pieVersion) {
  pieVersion.innerHTML = '<button class="verlink" id="b_bitacora"></button>';
  const boton = document.getElementById('b_bitacora');
  boton.textContent = VERSION_TXT;
  boton.title = 'Ver la bitácora de versiones';
  boton.addEventListener('click', async () => {
    const { abrirBitacora } = await import('./ui/bitacora.js');
    abrirBitacora();
  });
}

const zonaPortada = document.getElementById('portada');
const zonaApp = document.getElementById('estimador');

/* El estimador es un módulo grande que se monta a sí mismo al importarse.
   Lo cargamos sólo cuando hay un proyecto abierto, para que la portada
   aparezca de inmediato y no pague el costo de arrancarlo. */
let estimadorCargado = false;

/* EL ERROR TIENE QUE VERSE. Es la otra mitad de retirar el fallback silencioso
   del catálogo: si `abrirProyecto` lanza y nadie lo atrapa, el resultado es un
   rechazo de promesa no capturado —una línea en la consola y nada en pantalla—,
   que es el mismo fallo invisible en otro sitio.

   Se atrapa aquí y no en los cuatro sitios donde `portada.js` llama a
   `alAbrir(p)`: los cuatro lo hacen sin `await` y sin `.catch()`, así que
   ninguno vería la excepción. Un solo punto, y cubre a quien llame mañana. */
async function abrir(proyecto){
  try {
    await abrirProyecto(proyecto);
  } catch (err) {
    /* El catálogo compartido falló con nube y sesión. NO se abre el proyecto
       con el catálogo local a medias: los precios de la pantalla vendrían de
       otra fuente que la que el usuario cree, y eso alimenta una propuesta. */
    console.error('No se pudo abrir el proyecto:', err);
    const pistas = {
      vacio: '\n\nRevisa que el catálogo esté cargado en la base, y que la '
           + 'RLS deje verlo con este rol.',
      /* Un 404 aquí no significa necesariamente que la función no exista: la
         caché de esquema de PostgREST puede estar vieja. Por eso la pista
         nombra las dos posibilidades en vez de mandar a buscar una función que
         a lo mejor está puesta. */
      consulta: '\n\nRevisa la conexión, la sesión y los permisos. Si el '
              + 'mensaje habla de que no se encuentra `fn_conceptos_de`, puede '
              + 'faltar la función o estar vieja la caché de esquema.',
      ambito: '\n\nLa base devolvió conceptos de otro ámbito. Revisa la '
            + 'definición de `fn_conceptos_de`.',
      proyecto: '\n\nSon los conceptos propios de esta estación. Abrir sin '
              + 'ellos cotizaría con los precios del catálogo general.'
    };
    /* EL MENSAJE DE LA BASE LLEGA A LA PANTALLA. `fn_conceptos_de` levanta
       «Este perfil no tiene acceso a los costos del catálogo» precisamente
       para que nadie vea un resultado ambiguo; sustituirlo por un texto
       genérico desperdiciaría ese trabajo. Vale igual para «no se encuentra la
       función» y para «permiso denegado»: tres causas distintas que si no se
       ven producen el mismo diagnóstico equivocado. */
    const dijo = err?.detalle?.message ? `\n\nLa base dijo: ${err.detalle.message}` : '';
    const extra = pistas[err?.causa] || '';
    alert(`${err?.message || err}${dijo}${extra}`);
    /* La portada se repinta porque «crear» y «duplicar» ya escribieron en la
       base antes de llegar aquí: sin refrescar, el proyecto existe y no se ve,
       y volver a pulsar crea otro. */
    if(portada) portada.refrescar();
    return;
  }
  zonaPortada.classList.add('hide');
  zonaApp.classList.remove('hide');
  if(!estimadorCargado){
    estimadorCargado = true;
    await import('./lib/app.js');
  }
  /* Avisamos siempre, no sólo en aperturas posteriores: así el estimador carga
     el proyecto sin depender de si su módulo ya estaba evaluado. */
  window.dispatchEvent(new CustomEvent('proyecto:abierto'));
}

function volverAPortada(){
  zonaApp.classList.add('hide');
  zonaPortada.classList.remove('hide');
  if (portada) portada.refrescar();
}
window.volverAPortada = volverAPortada;

let portada = null;

/* BAJO BEYOND PLATFORM LA PUERTA ES DE BEYOND, NO DE ESTA APLICACIÓN.
   Montada en /ec/* por el proxy del shell, esta app comparte origen y
   sesión de Supabase con Beyond: quien llega aquí ya entró por el login
   de la plataforma. Si NO hay sesión —enlace profundo sin entrar, o una
   sesión que caducó estando dentro—, mostrar la portada propia con
   «Continuar con Google» sería una segunda puerta, que es exactamente lo
   que la decisión de producto de única entrada prohíbe: se devuelve a la
   raíz, donde vive el login de Beyond. En el host propio (desarrollo,
   standalone) nada de esto aplica y la portada sigue siendo la de
   siempre. `replace` y no `href`: la parada intermedia no debe quedar en
   el historial, o el botón Atrás la resucitaría. */
function guardiaBeyond(){
  if (!bajoBeyond() || !hayNube) return false;
  /* LA MISMA VARA QUE LA PUERTA DE BEYOND: sesión CON perfil activo.
     Pedir solo sesión dejaba pasar a una cuenta dada de baja o sin alta
     —que Beyond acaba de rechazar en su puerta— hasta la portada de
     proyectos, porque la RLS de lectura pide autenticación, no perfil.
     Y quien rebota aquí recibe el mensaje honesto DE LA PLATAFORMA
     (sin alta / dada de baja / sin respuesta), no la tarjeta standalone
     de esta app, que es la segunda superficie que el issue prohíbe. */
  if (sesion.usuario && sesion.perfil && sesion.perfil.activo !== false) {
    return false;
  }
  window.location.replace('/');
  return true;
}

/* Una página restaurada desde el bfcache es la FOTO de antes: si la
   sesión se cerró en otra página, esta seguiría pintada como si nada.
   Recargar al restaurar hace que la guardia vuelva a correr. En Chrome
   el canal de auth-js ya inhabilita el bfcache; esto cubre a los demás
   navegadores sin depender de ese detalle. */
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) window.location.reload();
});

(async () => {
  await iniciarSesion();
  if (guardiaBeyond()) return;
  /* El camino de regreso al shell, sólo cuando el shell existe: en el
     host propio no hay a dónde volver. */
  if (bajoBeyond()) {
    const volver = document.createElement('a');
    volver.className = 'volver-beyond';
    volver.href = '/';
    volver.textContent = '← Beyond Platform';
    document.body.prepend(volver);
  }
  portada = montarPortada(zonaPortada, { alAbrir: abrir });
  alCambiarSesion(async () => {
    await iniciarSesion();
    if (guardiaBeyond()) return;
    portada.refrescar();
  });
})();
