/* Publicación versionada de la hoja de inversionista.
   ===================================================

   QUÉ PROBLEMA RESUELVE
   ---------------------
   La vista de inversionista se recalcula en cada render: si el proyectista
   mueve un precio, la hoja cambia debajo. Eso está bien para trabajar y está
   mal para enseñar. Un inversionista al que se le presentó un EBITDA el martes
   tiene que poder volver el viernes y ver **ese** EBITDA, no el que resultó de
   los cambios del miércoles.

   Publicar congela una versión: se guarda el snapshot completo, no una
   referencia al proyecto. A partir de ahí el proyecto puede seguir moviéndose
   sin tocar lo que ya se enseñó.

   POR QUÉ ES EL CIMIENTO DEL PORTAL DE INVITADOS, Y NO UN ADORNO
   --------------------------------------------------------------
   Hoy la curaduría ocurre en el navegador: `snapshot.js` arma la hoja campo
   por campo a partir del estado completo del proyecto. Eso sólo es seguro
   cuando quien mira ya tenía derecho a ver todo, que es el caso de un interno.

   Para un invitado de verdad la frontera tiene que estar ANTES de que el dato
   salga de la base, y eso exige que exista un objeto publicable y
   autocontenido que se pueda servir solo, sin el proyecto detrás. Este módulo
   produce exactamente ese objeto.

   DÓNDE VIVE HOY Y DÓNDE VA A VIVIR
   ---------------------------------
   Hoy las publicaciones se guardan en `estado.finanzas.publicaciones`, dentro
   del propio proyecto, porque esta iteración no hace migración de base. Eso
   significa que **todavía no hay frontera de lectura**: quien puede leer el
   proyecto puede leer sus publicaciones.

   El día que exista el portal —según lo acordado, servido por Beyond Platform
   contra su propio inicio de sesión— esta lista se muda a su propia tabla y la
   frontera pasa a la base de datos. El contenido no cambia, y por eso cada
   publicación lleva su propio número de contrato: lo que se mueve es dónde
   está guardada y quién la puede leer, no su forma.

   EL CONTRATO
   -----------
   `CONTRATO` versiona la FORMA del objeto publicado, no la del estado del
   proyecto. Es el número que otro sistema —el portal— va a leer para saber
   interpretar lo que recibe. Cambiarlo es romper a quien lo consuma, así que
   se sube sólo cuando la forma cambie de verdad.
*/

/* Contrato 2 añade a cada anualidad publicada el desglose explícito de
   franquicia, otros variables y OPEX fijo. Las publicaciones contrato 1 siguen
   siendo legibles: `contratoConocido()` acepta cualquier contrato <= actual. */
export const CONTRATO = 2;

let contador = 0;
const idNuevo = () => {
  contador += 1;
  return `pub-${Date.now().toString(36)}-${contador}`;
};

const txt = (v) => (v == null ? "" : String(v));
const clon = (x) => JSON.parse(JSON.stringify(x));

/* Crea una publicación a partir del snapshot que la pantalla acaba de armar.
   El snapshot se CLONA: si quien llama sigue usando su objeto y lo muta, la
   publicación no se entera. Congelar de verdad es la mitad del punto. */
export function crearPublicacion({ snapshot, etiqueta = "", version = "",
  escenario = null, fecha = new Date() } = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("No hay hoja que publicar.");
  }
  const cuando = fecha instanceof Date ? fecha : new Date(fecha);
  const valida = !Number.isNaN(cuando.getTime());
  return {
    id: idNuevo(),
    contrato: CONTRATO,
    publicado: valida ? cuando.toISOString() : "",
    publicadoTxt: valida
      ? cuando.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })
      : "",
    /* El nombre que le pone quien publica. Sirve para distinguir «lo que se
       enseñó en el comité» de «la corrida con el escenario optimista». */
    etiqueta: txt(etiqueta).trim(),
    /* La versión del instrumento que produjo las cifras. Sin esto, una hoja
       impresa no se puede reconciliar con el código que la calculó, que es la
       misma razón por la que la propuesta la lleva en el pie. */
    version: txt(version),
    escenario: [1, 2, 3].includes(+escenario) ? +escenario : null,
    snapshot: clon(snapshot),
  };
}

/* Lo que una publicación guardada tiene que tener para poder enseñarse. Una
   publicación sin snapshot no es una publicación incompleta: es basura, y se
   descarta en vez de pintar una hoja vacía. */
function publicacionValida(p) {
  return !!(p && typeof p === "object" && p.snapshot
    && typeof p.snapshot === "object");
}

export function normalizarPublicaciones(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(publicacionValida).map((p) => ({
    // Lo que esta versión no conoce se conserva, como en el resto del estado.
    ...p,
    id: p.id || idNuevo(),
    /* Una publicación hecha por una versión POSTERIOR conserva su número de
       contrato: mentir sobre él sería peor que no saber leerla. */
    contrato: Number.isFinite(+p.contrato) ? +p.contrato : CONTRATO,
    publicado: txt(p.publicado),
    publicadoTxt: txt(p.publicadoTxt),
    etiqueta: txt(p.etiqueta),
    version: txt(p.version),
    escenario: [1, 2, 3].includes(+p.escenario) ? +p.escenario : null,
  }));
}

/* Las publicaciones se ordenan de la más reciente a la más vieja. El orden de
   captura no sirve: una lista guardada por otra versión puede venir en
   cualquier orden. */
export function ordenadas(lista = []) {
  return [...(lista || [])].sort((a, b) =>
    txt(b.publicado).localeCompare(txt(a.publicado)));
}

export function ultimaPublicacion(lista = []) {
  return ordenadas(lista)[0] || null;
}

/* Una publicación con un contrato que esta versión no conoce se puede listar
   —existe, tiene fecha y etiqueta— pero no se pinta como si se entendiera. */
export function contratoConocido(p) {
  return !!p && +p.contrato <= CONTRATO;
}

/* CAMPOS QUE CAMBIAN SOLOS Y NO SON UN CAMBIO.
   `meta.fecha` y `meta.fechaTxt` se rellenan con la hora del render, así que
   comparar los snapshots tal cual diría «hay cambios» un milisegundo después
   de publicar. Se comparan sin ellos. */
function comparable(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  const copia = clon(snapshot);
  if (copia.meta) { delete copia.meta.fecha; delete copia.meta.fechaTxt; }
  return JSON.stringify(copia);
}

/* ¿Lo que se ve en vivo difiere de lo último publicado? Es la pregunta que
   evita el error caro: enseñar una hoja creyendo que es la que se mandó.
   Sin publicaciones no hay nada que comparar y la respuesta es `false`: no
   hay «cambios sin publicar» cuando nunca se publicó. */
export function hayCambiosSinPublicar(snapshotActual, lista = []) {
  const ultima = ultimaPublicacion(lista);
  if (!ultima) return false;
  return comparable(snapshotActual) !== comparable(ultima.snapshot);
}

/* Lo que se le entregaría a otro sistema: la publicación sola, sin el proyecto
   detrás. Es autocontenida a propósito —el portal no tiene por qué conocer el
   estado del proyecto para pintar la hoja— y es lo que se moverá a su propia
   tabla cuando exista la frontera de base de datos. */
export function paraEntrega(p) {
  if (!publicacionValida(p)) return null;
  return {
    contrato: +p.contrato || CONTRATO,
    id: txt(p.id),
    publicado: txt(p.publicado),
    etiqueta: txt(p.etiqueta),
    version: txt(p.version),
    snapshot: clon(p.snapshot),
  };
}
