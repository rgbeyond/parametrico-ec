/* Modelo del portal de inversionistas: la lista blanca (issue #9).
   ================================================================

   ESTA FUNCIÓN ES LA FRONTERA, Y SE CONSTRUYE CAMPO POR CAMPO
   -----------------------------------------------------------
   `modeloPortal()` recibe el registro del proyecto tal como viene de la base
   —con su `estado` completo— y devuelve **sólo** lo que el portal puede
   enseñar. La regla no admite atajos: aquí no se hace `{...estado}` ni
   `{...proyecto}`. Cada campo se nombra y se copia uno por uno.

   Consecuencia buscada: si mañana alguien agrega un campo al estado del
   proyecto, ese campo NO aparece en el portal hasta que alguien lo escriba a
   mano en esta función. Hay una prueba que mete precios unitarios,
   comentarios, usuarios y catálogo dentro del proyecto y comprueba que no
   salen.

   LO QUE NO ENTRA, DICHO POR SU NOMBRE
   ------------------------------------
   `edits`, `genEdits`, `genApproved`, el catálogo, los precios unitarios, la
   base de cada número, los comentarios, los usuarios, los roles, la clave
   interna del proyecto y cualquier metadato administrativo.

   EL CAPEX NO SE RECALCULA
   ------------------------
   Sale de `estado.total` y `estado.directo`, que es lo que la propia
   aplicación guardó cuando alguien abrió y salvó el proyecto: el resultado de
   `totals()`, el mismo que pinta el presupuesto y que alimenta la exportación.
   Este módulo **no** tiene motor de costos y no debe tenerlo nunca. Si esas
   llaves no están —un proyecto guardado por una versión que no las escribía—,
   la inversión se reporta como no disponible, **no como cero**: un cero se
   lee como un resultado y aquí sería un hueco.

   LAS DERIVACIONES TÉCNICAS SON LAS DEL ESTIMADOR
   -----------------------------------------------
   Equipos, puntos, potencia instalada, demanda de diseño y piso de demanda
   contratada se toman de `src/lib/derivadas.js`, que es el mismo módulo que
   usa `app.js`. No hay una segunda implementación.

   DOS ESTADOS, Y EL SEGUNDO NO SE INVENTA
   ---------------------------------------
   - **Sin publicación financiera**: el portal enseña proyecto, ubicación,
     inversión y resumen técnico, y dice que la proyección está pendiente de
     publicación. No pinta ceros como si fueran resultados.
   - **Con publicación**: se enseña la versión CONGELADA tal cual. El portal no
     recalcula nada de ella: `publicacion.js` ya la dejó lista.
*/

import { nEvse, nCon, potEvse, potDis, demCon } from "../derivadas.js";
import { ordenadas, contratoConocido } from "../finanzas/publicacion.js";

/* Las llaves de primer nivel del modelo. La prueba compara contra esta lista:
   si alguien agrega un campo sin declararlo aquí, falla. */
export const CAMPOS_PORTAL = ["proyecto", "inversion", "tecnico", "finanzas", "meta"];

const num = (v) => (Number.isFinite(+v) ? +v : null);
const txt = (v) => (v == null ? "" : String(v));
const clon = (x) => JSON.parse(JSON.stringify(x));

/* La publicación que toca enseñar: la pedida por id, o la más reciente. Se
   ignoran las que esta versión no sabe interpretar en vez de pintarlas a
   medias. */
export function elegirPublicacion(lista = [], id = null) {
  const buenas = ordenadas(lista || []).filter(contratoConocido);
  if (!buenas.length) return null;
  if (id) return buenas.find((p) => p.id === id) || null;
  return buenas[0];
}

export function modeloPortal(proyecto, publicacion = null, { ahora = new Date(),
  version = "" } = {}) {
  if (!proyecto || typeof proyecto !== "object") return null;
  /* `estado` puede no existir, venir vacío o venir de una versión anterior.
     Nada de lo que sigue puede asumir su forma. */
  const estado = (proyecto.estado && typeof proyecto.estado === "object")
    ? proyecto.estado : {};
  const cfg = (estado.cfg && typeof estado.cfg === "object") ? estado.cfg : {};

  const instalada = potEvse(cfg);
  const diseno = potDis(cfg);
  const balanceo = !!cfg.balanceo;
  const kva = num(cfg.kva);
  const kwp = num(cfg.kwp) || 0;
  const bess = num(cfg.bess) || 0;

  const cuando = ahora instanceof Date ? ahora : new Date(ahora);
  const valida = !Number.isNaN(cuando.getTime());

  return {
    proyecto: {
      /* El nombre y la ubicación se toman del registro, no del `cfg`: es lo
         que la portada enseña y lo que el proyecto declara de sí mismo. */
      nombre: txt(proyecto.nombre) || txt(cfg.nom) || "Proyecto sin nombre",
      ubicacion: txt(proyecto.ubicacion) || txt(cfg.loc),
    },
    inversion: {
      /* De `estado`, no recalculado. `null` cuando el proyecto todavía no ha
         sido guardado por una versión que escriba estas llaves. */
      total: num(estado.total),
      directo: num(estado.directo),
      clase: txt(estado.clase),
      indice: num(estado.idd),
    },
    tecnico: {
      equipos: nEvse(cfg),
      puntos: nCon(cfg),
      potenciaInstalada: instalada,
      potenciaDiseno: diseno,
      balanceo: { activo: balanceo, pct: balanceo ? (num(cfg.balanceoPct) || 0) : 0 },
      transformador: { kva, primaria: num(cfg.vmt), secundaria: num(cfg.vbt) },
      /* Declarada si el proyecto la capturó; si no, el piso que fija la
         tarifa. La pantalla dice cuál de las dos está enseñando. */
      demandaContratada: {
        kw: instalada > 0 || num(cfg.demCon) ? demCon(cfg) : null,
        declarada: (num(cfg.demCon) || 0) > 0,
      },
      generacion: { kwp, rendimiento: num(cfg.fvKwhKwp) },
      almacenamiento: {
        modulos: bess,
        kwh: bess > 0 ? (num(cfg.besskwh) || 0) * bess : 0,
        kw: bess > 0 ? (num(cfg.besskw) || 0) * bess : 0,
      },
      suministro: {
        /* Sólo la procedencia de la tarifa, nunca sus cargos: un cargo por
           kWh es dato comercial interno. */
        suministrador: txt(cfg.sumin),
        categoria: txt(cfg.tarifaCat),
        division: txt(cfg.tarifaDiv),
        mes: txt(cfg.tarifaMes),
        mercadoMayorista: !!cfg.mem,
      },
      modelo: txt(cfg.modo),
    },
    /* La publicación entra CONGELADA y completa: ya pasó por la lista blanca
       de `snapshot.js` cuando se publicó, y volver a tocarla aquí sólo podría
       romperla. `null` cuando el proyecto no tiene ninguna. */
    finanzas: publicacion
      ? {
        id: txt(publicacion.id),
        contrato: num(publicacion.contrato),
        publicado: txt(publicacion.publicado),
        publicadoTxt: txt(publicacion.publicadoTxt),
        etiqueta: txt(publicacion.etiqueta),
        version: txt(publicacion.version),
        snapshot: clon(publicacion.snapshot),
      }
      : null,
    meta: {
      /* El identificador del proyecto viaja porque la liga ya lo trae en la
         barra de direcciones: ocultarlo aquí no escondería nada. La clave
         interna y las marcas de tiempo administrativas NO viajan. */
      proyectoId: txt(proyecto.id),
      generado: valida ? cuando.toISOString() : "",
      generadoTxt: valida
        ? cuando.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })
        : "",
      version: txt(version),
    },
  };
}

/* Las publicaciones disponibles, reducidas a lo que el selector necesita.
   Nunca se le pasa la lista completa a la interfaz: cada elemento trae su
   snapshot entero y no hay razón para tenerlos todos en pantalla. */
export function versionesDisponibles(lista = []) {
  return ordenadas(lista || []).filter(contratoConocido).map((p) => ({
    id: txt(p.id),
    etiqueta: txt(p.etiqueta),
    publicadoTxt: txt(p.publicadoTxt) || txt(p.publicado),
  }));
}
