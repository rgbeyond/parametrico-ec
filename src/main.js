import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import logoUrl from './assets/logos/beyond-orange.png';
import { VERSION_TXT } from './lib/version.js';
import { iniciarSesion, alCambiarSesion, sesion } from './lib/sesion.js';
import { montarPortada } from './ui/portada.js';
import { abrirProyecto } from './lib/contexto.js';
import { tomarRetorno } from './lib/retorno.js';
import { BAJO_PLATFORM, BASE } from './lib/platform.js';
import { supabase } from './lib/supabase.js';
import { exigirAcceso, vigilarSesion } from './lib/contrato/adaptador-v1.mjs';
import { ESTADOS_PUERTA } from './lib/contrato/sesion-v1.mjs';
import { iniciarTema, montarEncabezado } from './lib/contrato/interfaz-v1.mjs';
import './lib/contrato/interfaz-v1.css';
import { ROLES } from './lib/sesion.js';
import { fijarCompartir } from './lib/compartir_entrada.js';

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

/* BAJO PLATFORM: ENCABEZADO Y TEMA COMUNES (beyond-ui-contract/v1).
   «← beyond core», tema y cuenta informativa, iguales que en Core y en
   Proyectos de Energía. Va antes de la puerta: si la consulta falla, el
   regreso sigue ahí. Cerrar sesión es de Core: aquí no hay «Salir». El
   standalone no lo monta y sigue en oscuro, con su barra y su «Salir». */
let encabezado = null;
if (BAJO_PLATFORM) {
  document.documentElement.classList.add('integrada');
  /* Nombre visible bajo beyond core (UI-02): «EV Charging Stations». No cambia
     /ec/, IDs, contratos ni el nombre del repo; el standalone conserva el suyo. */
  document.title = 'EV Charging Stations';
  const tema = iniciarTema(document, window);
  encabezado = montarEncabezado(document.getElementById('encabezado-comun'), {
    superficie: 'app', titulo: 'EV Charging Stations',
    entorno: import.meta.env.VITE_BEYOND_ENTORNO || null, logo: logoUrl, tema,
    /* El estimador guarda solo, 700 ms después de cada cambio. Si queda algo
       sin guardar o un guardado en vuelo, regresar lo dejaría atrás: se
       pregunta, y cancelar no toca la ruta ni lo capturado. */
    antesDeVolver: () => (window.estimadorPendiente?.()
      ? 'Hay cambios del proyecto que todavía no se guardan. Si vuelves ahora a beyond core, pueden perderse. ¿Volver de todos modos?'
      : null),
  });
}
/* La ruta interna y, con un proyecto abierto, la entrada «Compartir» de
   beyond core (Compartir C2): solo navegación, sin datos del proyecto. */
const migas = (partes, compartir = null) => { encabezado?.fijarRuta(partes); fijarCompartir(encabezado, compartir); };

/* El estimador es un módulo grande que se monta a sí mismo al importarse.
   Lo cargamos sólo cuando hay un proyecto abierto, para que la portada
   aparezca de inmediato y no pague el costo de arrancarlo. */
let estimadorCargado = false;

async function abrir(proyecto){
  await abrirProyecto(proyecto);
  zonaPortada.classList.add('hide');
  zonaApp.classList.remove('hide');
  /* «Proyectos» enlazado, como en Proyectos de Energía: vuelve a la portada
     sin recargar (la lista no tiene ruta propia); el botón «Todos los
     proyectos» del estimador, que hacía lo mismo, se oculta bajo Platform. */
  migas([{ texto: 'Proyectos', href: BASE, alActivar: () => volverAPortada() }, { texto: proyecto?.nombre || 'Proyecto' }], { tipo: 'ev', id: proyecto?.id });
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
  migas([{ texto: 'Proyectos' }]);
  if (portada) portada.refrescar();
}
window.volverAPortada = volverAPortada;

let portada = null;

/* Bajo Platform, la puerta del contrato va ANTES de todo: sin sesión o sin
   alta se va al acceso de Platform con retorno a esta ruta; si falló la
   consulta o falta configuración, se dice aquí y no se monta nada. Nunca se
   pinta la portada propia con su «Continuar con Google». */
async function puertaPlatform(){
  const r = await exigirAcceso(supabase);
  if (r.estado === ESTADOS_PUERTA.ABIERTA) {
    vigilarSesion(supabase);
    encabezado.fijarCuenta({ correo: r.perfil?.correo || r.sesion?.user?.email || '',
      rol: ROLES[r.perfil?.rol]?.etiqueta || r.perfil?.rol });
    migas([{ texto: 'Proyectos' }]);
    return true;
  }
  if (r.estado === ESTADOS_PUERTA.SIN_CONFIGURACION || r.estado === ESTADOS_PUERTA.SIN_RESPUESTA) {
    zonaPortada.innerHTML = `<div class="note warn" role="alert" style="margin:40px auto;max-width:560px">${
      r.estado === ESTADOS_PUERTA.SIN_CONFIGURACION
        ? 'Este despliegue no tiene configurado su servicio de identidad: el módulo no se abre.'
        : 'No se pudo comprobar tu cuenta contra Beyond Platform. No es un problema de permisos: vuelve a cargar la página.'}</div>`;
  }
  return false;
}

(async () => {
  if (BAJO_PLATFORM && !(await puertaPlatform())) return;
  await iniciarSesion();

  /* RETORNO AL PORTAL DESPUÉS DE INICIAR SESIÓN.
     Va aquí, después de resolver la sesión y ANTES de montar la portada: quien
     abrió la liga de un portal y tuvo que entrar no debe ver de paso la
     aplicación interna. Se consume una sola vez y sólo acepta rutas locales de
     la lista blanca; ver `src/lib/retorno.js`.

     La condición de sesión válida es lo que evita el bucle: sin perfil no se
     consume nada, así que la ruta sigue esperando al siguiente intento en vez
     de rebotar entre la raíz y el portal. */
  /* Bajo Platform el retorno lo resuelve Platform (contrato §5). */
  if (sesion.perfil && !BAJO_PLATFORM) {
    const destino = tomarRetorno(window.sessionStorage);
    if (destino) { window.location.replace(destino); return; }
  }

  portada = montarPortada(zonaPortada, { alAbrir: abrir });
  alCambiarSesion(async () => { await iniciarSesion(); portada.refrescar(); });
})();
