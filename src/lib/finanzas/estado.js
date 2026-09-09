/* Estado financiero del proyecto: forma, versión y compatibilidad (issue #7).
   =========================================================================

   QUÉ GUARDA Y DÓNDE
   ------------------
   Todo lo financiero vive en una sola llave del estado del proyecto,
   `estado.finanzas`, con su propia versión (`v`). El resto del estado —`cfg`,
   `edits`, `genEdits`, `genApproved`— no se toca: esta P0 no mueve ni un
   número del motor de costos.

   LA REGLA QUE MANDA: UN PROYECTO SIN FINANZAS NO TIENE FINANZAS
   --------------------------------------------------------------
   Los ocho proyectos que hoy existen se guardaron sin esta llave. Abrirlos no
   puede inventarles una: `normalizar()` devuelve `null` cuando no hay nada que
   normalizar, y `app.js` sólo escribe `finanzas` en el estado guardado cuando
   ese valor dejó de ser nulo, o sea cuando alguien capturó algo de verdad.

   La consecuencia es la que pidió RG: abrir un proyecto viejo no lo marca como
   sucio, no dispara el guardado automático y no mueve `actualizado_en`. Si en
   vez de esto se materializaran valores por omisión al abrir, el primer
   `touch()` de cualquier otra pestaña los persistiría y ocho proyectos
   quedarían con una estructura que nadie pidió.

   LAS LLAVES QUE ESTA VERSIÓN NO CONOCE SE CONSERVAN
   --------------------------------------------------
   Si un día una versión posterior agrega campos y el proyecto se vuelve a
   abrir con esta, lo que no se reconoce se copia tal cual en lugar de
   desaparecer. Es la misma decisión que ya toma el resto de la aplicación al
   mezclar con `Object.assign` en vez de reemplazar.

   NO IMPORTA NADA A PROPÓSITO
   ---------------------------
   Este módulo y sus hermanos (`opex.js`, `inversionistas.js`, `snapshot.js`,
   `vista.js`) no importan JSON, ni Supabase, ni el DOM: así se prueban en Node
   sin navegador, que es la condición que puso el issue.
*/

export const VERSION_FINANZAS = 1;

/* Identificadores de renglón. Sirven para dos cosas: para que la interfaz
   pueda reconstruir la tabla sólo cuando cambia el conjunto de renglones —y no
   en cada tecla, que haría perder el cursor— y para poder borrar el renglón
   correcto sin depender de su posición. El contador local evita colisiones
   dentro de una misma sesión; la marca de tiempo, entre sesiones. */
let contador = 0;
export function idNuevo(prefijo = "f") {
  contador += 1;
  return `${prefijo}-${Date.now().toString(36)}-${contador}`;
}

export function finanzasNueva() {
  return { v: VERSION_FINANZAS, opex: [], inversionistas: [], notas: "" };
}

export function renglonOpexNuevo(parcial = {}) {
  return {
    id: parcial.id || idNuevo("opex"),
    concepto: parcial.concepto ?? "",
    categoria: parcial.categoria ?? "Otros",
    monto: numero(parcial.monto),
    activo: parcial.activo !== false,
  };
}

export function inversionistaNuevo(parcial = {}) {
  return {
    id: parcial.id || idNuevo("inv"),
    nombre: parcial.nombre ?? "",
    aportacion: numero(parcial.aportacion),
    activo: parcial.activo !== false,
  };
}

/* Un monto capturado a mano puede llegar como texto, vacío, negativo o NaN.
   Se normaliza a número finito y no negativo: un OPEX negativo no significa
   nada y una aportación negativa produciría participaciones sin sentido. Si
   algún día hace falta representar un abono, será un concepto propio y no un
   signo escondido en este campo. */
function numero(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* Devuelve `null` cuando el proyecto no trae finanzas. No es un descuido: es
   la diferencia entre "este proyecto no tiene finanzas" y "tiene finanzas
   vacías", y de ella depende que abrir no persista nada. */
export function normalizarFinanzas(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const opex = Array.isArray(raw.opex) ? raw.opex : [];
  const inversionistas = Array.isArray(raw.inversionistas) ? raw.inversionistas : [];
  return {
    // Lo que esta versión no conoce se conserva; lo de abajo lo sobreescribe.
    ...raw,
    v: VERSION_FINANZAS,
    opex: opex.filter((r) => r && typeof r === "object")
      .map((r) => ({ ...r, ...renglonOpexNuevo(r) })),
    inversionistas: inversionistas.filter((r) => r && typeof r === "object")
      .map((r) => ({ ...r, ...inversionistaNuevo(r) })),
    notas: typeof raw.notas === "string" ? raw.notas : "",
  };
}

/* `null` cuando no hay nada capturado. Lo usa `app.js` para decidir si la
   llave `finanzas` entra o no en el estado que se guarda: un proyecto donde
   alguien entró a mirar y salió no debe quedar distinto a como estaba. */
export function finanzasVacias(f) {
  if (!f) return true;
  const sinOpex = !(f.opex || []).length;
  const sinInv = !(f.inversionistas || []).length;
  return sinOpex && sinInv && !String(f.notas || "").trim();
}
