/* Portal de inversionistas: la página (issue #9).
   ===============================================

   QUÉ ES Y QUÉ NO ES
   ------------------
   Una superficie standalone —no carga el estimador, ni sus pestañas, ni su
   shell— que enseña un proyecto concreto con la forma de un portal externo.

   **No es una frontera de seguridad y no se presenta como tal.** Lee con la
   sesión del usuario que ya entró al Paramétrico, que es un interno y que ya
   tenía derecho a ver ese proyecto. Lo que esta página aporta no es
   aislamiento sino CURADURÍA: aunque reciba el proyecto completo, sólo pinta
   lo que `modeloPortal()` deja pasar. El aislamiento de verdad —rol de
   invitado, RLS, identidad de la plataforma— es la pieza B y está bloqueada en
   `beyond-platform#10`.

   SIN SESIÓN NO SE PIDEN DATOS
   ----------------------------
   El orden importa: primero se resuelve la sesión, y sólo si hay perfil se
   consulta. Si no lo hay, la página enseña «Acceso requerido» y **no hace una
   sola petición de datos**. Hay prueba de navegador que lo comprueba
   interceptando la red.

   SÓLO LECTURA
   ------------
   Esta página hace un `select` y nada más. No escribe, no llama RPC y no toca
   `actualizado_en` del proyecto.
*/

import './styles/fonts.css';
import './styles/portal.css';
import logoUrl from './assets/logos/beyond-orange.png';
import { VERSION_TXT } from './lib/version.js';
import { iniciarSesion, entrar, sesion } from './lib/sesion.js';
import { hayNube } from './lib/supabase.js';
import { leerProyectoPortal } from './lib/datos.js';
import { normalizarPublicaciones } from './lib/finanzas/publicacion.js';
import { modeloPortal, elegirPublicacion, versionesDisponibles } from './lib/portal/modelo.js';
import { portalHTML, seccionesVisibles } from './lib/portal/vista.js';
import { guardarRetorno, rutaActual } from './lib/retorno.js';

document.documentElement.style.setProperty('--logo', `url("${logoUrl}")`);

const zona = document.getElementById('portal');
const esc = (s) => String(s ?? '').replace(/[<>&"]/g,
  (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* Un identificador que no tiene forma de UUID no se manda a la base: se
   rechaza aquí. No es seguridad —la base valida sola—, es no mandar basura. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pantalla(titulo, texto, accion) {
  zona.innerHTML = `<div class="estado">
    <div class="marca" role="img" aria-label="Beyond"></div>
    <h2>${esc(titulo)}</h2>
    <p>${esc(texto)}</p>
    ${accion ? (accion.href
    ? `<a href="${esc(accion.href)}">${esc(accion.texto)}</a>`
    : `<button type="button" id="portal_accion">${esc(accion.texto)}</button>`) : ''}
    <div class="aviso-estado" id="portal_msg" hidden></div>
  </div>`;
  if (accion && accion.alPulsar) {
    zona.querySelector('#portal_accion').addEventListener('click', accion.alPulsar);
  }
}

const mensajeEstado = (texto) => {
  const el = zona.querySelector('#portal_msg');
  if (!el) return;
  el.textContent = texto;
  el.hidden = !texto;
};

/* La pantalla de acceso. No manda al usuario a la aplicación interna: lanza el
   mismo inicio de sesión desde aquí, y antes de irse deja anotada la ruta a la
   que hay que volver. Quien abre una liga de un portal no tiene por qué
   enterarse de que detrás hay una herramienta administrativa. */
function pantallaAcceso() {
  guardarRetorno(rutaActual(window.location), window.sessionStorage);
  pantalla('Inicia sesión para acceder a este portal',
    'Usa tu cuenta de Beyond. Al terminar volverás directamente a esta página.',
    {
      texto: 'Ingresar al portal',
      alPulsar: async (e) => {
        const b = e.target;
        b.disabled = true;
        const rotulo = b.textContent;
        b.textContent = 'Abriendo…';
        try {
          await entrar();
        } catch (err) {
          b.disabled = false;
          b.textContent = rotulo;
          mensajeEstado(err && err.message ? err.message
            : 'No se pudo iniciar el acceso.');
        }
      },
    });
}

/* La navegación y el selector de versión son los únicos controles de la
   página, y ninguno escribe nada: uno muestra secciones que ya están en el
   DOM, el otro vuelve a pintar con otra publicación. */
function montarNavegacion(modelo, alCambiarVersion, versiones, versionActual) {
  const secciones = seccionesVisibles(modelo);
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('role', 'tablist');
  nav.innerHTML = secciones.map((s, i) => `<button role="tab" data-ir="${s.id}"
    aria-selected="${i === 0}">${esc(s.nombre)}</button>`).join('');
  const main = zona.querySelector('main');
  zona.insertBefore(nav, main);

  const mostrar = (id) => {
    zona.querySelectorAll('[data-seccion]').forEach((s) => {
      s.hidden = s.dataset.seccion !== id;
    });
    nav.querySelectorAll('[data-ir]').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.ir === id));
    });
  };
  nav.querySelectorAll('[data-ir]').forEach((b) => {
    b.addEventListener('click', () => mostrar(b.dataset.ir));
  });
  mostrar(secciones[0].id);

  /* El selector sólo aparece cuando hay más de una versión publicada: con una
     sola, un desplegable de un elemento es ruido. */
  if (versiones.length > 1) {
    const caja = document.createElement('div');
    caja.className = 'versiones';
    caja.innerHTML = `<span>Versión publicada</span>
      <select id="portal_version">${versiones.map((v) => `<option value="${esc(v.id)}"${
  v.id === versionActual ? ' selected' : ''}>${esc(v.publicadoTxt)}${
  v.etiqueta ? ` · ${esc(v.etiqueta)}` : ''}</option>`).join('')}</select>`;
    zona.insertBefore(caja, main);
    caja.querySelector('select').addEventListener('change', (e) => {
      alCambiarVersion(e.target.value);
    });
  }
}

function pintar(proyecto, publicaciones, idVersion) {
  const publicacion = elegirPublicacion(publicaciones, idVersion);
  const modelo = modeloPortal(proyecto, publicacion, { version: VERSION_TXT });
  zona.innerHTML = portalHTML(modelo);
  montarNavegacion(modelo, (id) => pintar(proyecto, publicaciones, id),
    versionesDisponibles(publicaciones), publicacion ? publicacion.id : null);
  return modelo;
}

(async () => {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get('proyecto') || '').trim();

  /* 1. La sesión primero. Sin ella no se pide un solo dato. */
  await iniciarSesion();
  if (!hayNube || !sesion.perfil) {
    pantallaAcceso();
    return;
  }

  if (!UUID.test(id)) {
    pantalla('Falta el proyecto',
      'La liga no trae un identificador de proyecto válido.',
      { href: '/', texto: 'Ir a la aplicación' });
    return;
  }

  /* 2. Un solo proyecto, por identificador. No se lista nada. */
  let proyecto = null;
  try {
    proyecto = await leerProyectoPortal(id);
  } catch (err) {
    pantalla('No se pudo leer el proyecto',
      err && err.message ? err.message : 'Error de lectura.',
      { href: '/', texto: 'Ir a la aplicación' });
    return;
  }
  if (!proyecto) {
    pantalla('Proyecto no disponible',
      'No se encontró ese proyecto, o tu cuenta no tiene acceso a él.',
      { href: '/', texto: 'Ir a la aplicación' });
    return;
  }

  const publicaciones = normalizarPublicaciones(proyecto.estado?.finanzas?.publicaciones);
  pintar(proyecto, publicaciones, params.get('version'));
})();
