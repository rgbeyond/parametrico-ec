import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import logoUrl from './assets/logos/beyond-orange.png';
import { iniciarSesion, alCambiarSesion } from './lib/sesion.js';
import { montarPortada } from './ui/portada.js';
import { abrirProyecto } from './lib/contexto.js';

/* app.js fija esta misma variable cuando se carga, pero eso pasa hasta que
   se abre un proyecto. La portada la necesita desde el primer render. */
document.documentElement.style.setProperty('--logo', `url("${logoUrl}")`);

const zonaPortada = document.getElementById('portada');
const zonaApp = document.getElementById('estimador');

/* El estimador es un módulo grande que se monta a sí mismo al importarse.
   Lo cargamos sólo cuando hay un proyecto abierto, para que la portada
   aparezca de inmediato y no pague el costo de arrancarlo. */
let estimadorCargado = false;

async function abrir(proyecto){
  await abrirProyecto(proyecto);
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
