import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import logoUrl from './assets/logos/beyond-orange.png';
import { VERSION_TXT } from './lib/version.js';
import { iniciarSesion, alCambiarSesion, sesion } from './lib/sesion.js';
import { montarPortada } from './ui/portada.js';
import { abrirProyecto } from './lib/contexto.js';
import { tomarRetorno } from './lib/retorno.js';

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

  /* RETORNO AL PORTAL DESPUÉS DE INICIAR SESIÓN.
     Va aquí, después de resolver la sesión y ANTES de montar la portada: quien
     abrió la liga de un portal y tuvo que entrar no debe ver de paso la
     aplicación interna. Se consume una sola vez y sólo acepta rutas locales de
     la lista blanca; ver `src/lib/retorno.js`.

     La condición de sesión válida es lo que evita el bucle: sin perfil no se
     consume nada, así que la ruta sigue esperando al siguiente intento en vez
     de rebotar entre la raíz y el portal. */
  if (sesion.perfil) {
    const destino = tomarRetorno(window.sessionStorage);
    if (destino) { window.location.replace(destino); return; }
  }

  portada = montarPortada(zonaPortada, { alAbrir: abrir });
  alCambiarSesion(async () => { await iniciarSesion(); portada.refrescar(); });
})();
