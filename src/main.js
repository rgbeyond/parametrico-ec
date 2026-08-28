import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import logoUrl from './assets/logos/beyond-orange.png';
import { VERSION_TXT } from './lib/version.js';
import { iniciarSesion, alCambiarSesion } from './lib/sesion.js';
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
    const extra = err?.causa === 'vacio'
      ? '\n\nRevisa que el catálogo esté cargado en la base.'
      : err?.causa === 'consulta'
        ? '\n\nRevisa la conexión, la sesión y los permisos de la base.'
        : '';
    alert(`${err?.message || err}${extra}`);
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

(async () => {
  await iniciarSesion();
  portada = montarPortada(zonaPortada, { alAbrir: abrir });
  alCambiarSesion(async () => { await iniciarSesion(); portada.refrescar(); });
})();
