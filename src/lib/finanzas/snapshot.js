/* Snapshot para la vista de inversionista (issue #7).
   ===================================================

   ESTA FUNCIÓN ES LA FRONTERA, Y POR ESO SE CONSTRUYE CAMPO POR CAMPO
   -------------------------------------------------------------------
   La vista de inversionista es la única superficie de la aplicación pensada
   para que un día la vea alguien de fuera. Hoy vive dentro de la herramienta
   interna y no hay liga pública, pero el modelo de datos se escribe ya con esa
   frontera puesta, porque agregarla después es cuando se filtran las cosas.

   La regla es simple y no admite atajos: **aquí no se pasa `estado`**. Ni
   `cfg`, ni `rows`, ni el catálogo, ni las ediciones, ni los comentarios, ni
   los usuarios. Cada campo del snapshot se nombra y se copia uno por uno. Un
   `{...estado}` en este archivo convertiría la lista blanca en decoración: lo
   que llegue de más saldría solo.

   Consecuencia práctica: si mañana alguien agrega un campo al estado del
   proyecto, ese campo NO aparece aquí hasta que alguien lo escriba a mano en
   esta función. Es exactamente el comportamiento que se busca.

   QUÉ SÍ LLEVA Y POR QUÉ
   ----------------------
   - La cifra de inversión total, que es la que el proyecto ya calcula, y el
     depósito en garantía aparte, porque es dinero que hay que poner aunque sea
     reembolsable: esconderlo daría una necesidad de caja menor a la real.
   - La clase y el rango de precisión del estimado. Un inversionista tiene que
     saber que está viendo una Clase 4 con -22%/+35% y no un precio cerrado.
     Ocultarlo sería la omisión más cara de esta pantalla.
   - OPEX agregado y por categoría. Sin renglones: el detalle de gasto es
     interno.
   - Aportaciones y participaciones, sin identificadores internos ni la marca
     de activo/inactivo.

   QUÉ NO LLEVA
   ------------
   Precios unitarios, renglones del catálogo, códigos de concepto, la base de
   cada número, comentarios, historiales, usuarios, roles, configuración
   administrativa y cualquier parámetro de tarifa o de sitio.
*/

/* Las llaves de primer nivel que el snapshot puede tener. La prueba compara
   contra esta lista: si alguien agrega un campo sin declararlo aquí, falla. */
export const CAMPOS_SNAPSHOT = ["proyecto", "capex", "opex", "fondeo",
  "inversionistas", "operacion", "notas", "meta"];

const num = (v) => (Number.isFinite(+v) ? +v : 0);
const txt = (v) => (v == null ? "" : String(v));

export function snapshotInversionista({
  nombre = "", ubicacion = "",
  capexTotal = 0, deposito = 0, clase = "", precision = "",
  opex = { mensual: 0, anual: 0, porCategoria: [] },
  fondeo = { aportado: 0, faltante: 0, excedente: 0, cobertura: 0 },
  participantes = [],
  /* Resumen ANUAL de la proyección, ya agregado. Aquí no entra la serie
     mensual completa: un inversionista necesita la trayectoria por año, no
     ciento veinte renglones con el detalle operativo del proyecto. */
  operacion = [],
  notas = "",
  version = "", fecha = new Date(), demo = false,
} = {}) {
  const cuando = fecha instanceof Date ? fecha : new Date(fecha);
  const valida = !Number.isNaN(cuando.getTime());
  return {
    proyecto: { nombre: txt(nombre) || "Sin nombre", ubicacion: txt(ubicacion) },
    capex: {
      total: Math.round(num(capexTotal)),
      deposito: Math.round(num(deposito)),
      clase: txt(clase),
      precision: txt(precision),
    },
    opex: {
      mensual: Math.round(num(opex.mensual)),
      anual: Math.round(num(opex.anual)),
      porCategoria: (opex.porCategoria || []).map((c) => ({
        categoria: txt(c.categoria),
        mensual: Math.round(num(c.mensual)),
        pct: num(c.pct),
      })),
    },
    fondeo: {
      requerido: Math.round(num(capexTotal)),
      aportado: Math.round(num(fondeo.aportado)),
      faltante: Math.round(num(fondeo.faltante)),
      excedente: Math.round(num(fondeo.excedente)),
      cobertura: num(fondeo.cobertura),
    },
    /* Sólo tres campos por persona. Sin `id` y sin `activo`: son estado
       interno de la captura y no le dicen nada a quien lee la hoja. */
    inversionistas: (participantes || []).map((p) => ({
      nombre: txt(p.nombre) || "Sin nombre",
      aportacion: Math.round(num(p.aportacion)),
      participacion: num(p.participacion),
    })),
    /* Cinco cifras por año y ninguna más. Sin sesiones, sin kWh, sin costo
       unitario de energía, sin demanda facturable: el detalle operativo es
       interno y no le cambia la decisión a quien pone el capital. */
    operacion: (operacion || []).map((a) => ({
      anio: Math.round(num(a.anio)),
      ventas: Math.round(num(a.ventas)),
      costoEnergia: Math.round(num(a.costoElectricidad ?? a.costoEnergia)),
      opex: Math.round(num(a.opexFijo) + num(a.costoVariable)),
      ebitda: Math.round(num(a.ebitda)),
      margen: num(a.margen),
    })),
    notas: txt(notas),
    meta: {
      fecha: valida ? cuando.toISOString() : "",
      fechaTxt: valida
        ? cuando.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })
        : "",
      version: txt(version),
      /* Viaja con la hoja a propósito: si las cifras son de demostración, el
         aviso tiene que estar EN el documento y no sólo en la pantalla que lo
         enmarca, porque el documento es lo que alguien acabaría enseñando. */
      demo: !!demo,
    },
  };
}
