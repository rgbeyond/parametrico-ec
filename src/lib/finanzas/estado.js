/* Estado financiero del proyecto: forma, versión y compatibilidad (issue #7).
   =========================================================================

   QUÉ GUARDA Y DÓNDE
   ------------------
   Todo lo financiero vive en una sola llave del estado del proyecto,
   `estado.finanzas`, con su propia versión (`v`). El resto del estado —`cfg`,
   `edits`, `genEdits`, `genApproved`— no se toca: esta sección no mueve ni un
   número del motor de costos.

   LO QUE YA EXISTE EN `cfg` NO SE COPIA AQUÍ
   ------------------------------------------
   La regla de la iteración P0.1 es explícita y vale la pena repetirla en el
   propio archivo: si una variable ya vive en `cfg`, se reutiliza. No hay aquí
   una segunda copia de la tarifa, ni de los escenarios de consumo, ni de la
   generación, ni del balanceo. Lo que la sección OPEX hizo con esas variables
   fue mudar DÓNDE SE CAPTURAN, no duplicarlas.

   Vive en `cfg` y se reutiliza (no repetir aquí):
     tarifa        tarifaCat, tarifaDiv, tarifaMes, cargoCap, cargoDist,
                   cargoFijo, otrosKwh, enPunta, enInterm, enBase
     reparto       pctPunta, pctInterm, pctBase
     escenarios    esc1Ses/esc1Kwh/esc1Dmax y sus pares 2 y 3
     generación    kwp, fvKwhKwp, fvPerfil, fvMeses
     almacenamiento bess, besskwh, besskw, bessDoD, bessEff, diasPunta, horasPico
     balanceo      balanceo, balanceoPct
     suministrador sumin, mem

   Vive aquí porque es supuesto financiero nuevo: `ctrl` (abajo), el OPEX, los
   costos variables sobre ventas y los inversionistas.

   LA REGLA QUE MANDA: UN PROYECTO SIN FINANZAS NO TIENE FINANZAS
   --------------------------------------------------------------
   Los proyectos que ya existen se guardaron sin esta llave. Abrirlos no puede
   inventarles una: `normalizarFinanzas()` devuelve `null` cuando no hay nada
   que normalizar, y `app.js` sólo escribe `finanzas` en el estado guardado
   cuando ese valor dejó de ser nulo, o sea cuando alguien capturó algo.

   La consecuencia es la que pidió RG: abrir un proyecto viejo no lo marca como
   sucio, no dispara el guardado automático y no mueve `actualizado_en`.

   LAS LLAVES QUE ESTA VERSIÓN NO CONOCE SE CONSERVAN
   --------------------------------------------------
   Igual que hace el resto de la aplicación al mezclar con `Object.assign` en
   vez de reemplazar. Un `finanzas` escrito por una versión posterior no pierde
   sus campos por abrirse aquí.

   VERSIÓN 2
   ---------
   La v1 tenía `opex`, `inversionistas` y `notas`. La v2 agrega `ctrl` —los
   supuestos de operación—, `variables` —costos como porcentaje de ventas— y
   una regla de incremento anual por cada renglón de OPEX. Un `finanzas` v1 se
   actualiza al leerlo, sin perder nada: los renglones que no traían regla de
   incremento quedan en «IPC del proyecto», que es lo que el issue pide como
   arranque. `estado.v` global NO cambia por esto.
*/

export const VERSION_FINANZAS = 2;

/* Identificadores de renglón. Sirven para dos cosas: para que la interfaz
   pueda reconstruir la tabla sólo cuando cambia el conjunto de renglones —y no
   en cada tecla, que haría perder el cursor— y para poder borrar el renglón
   correcto sin depender de su posición. */
let contador = 0;
export function idNuevo(prefijo = "f") {
  contador += 1;
  return `${prefijo}-${Date.now().toString(36)}-${contador}`;
}

/* Modos de incremento anual de un renglón de OPEX. */
export const MODOS_INCREMENTO = {
  ipc: "IPC del proyecto",
  propia: "Tasa propia",
  ninguno: "Sin incremento",
};

/* SUPUESTOS DE OPERACIÓN. Todos arrancan en un valor NEUTRO, no en uno
   plausible: un IPC de 4.5% o un uptime de 97% precargados serían cifras
   inventadas presentadas como datos, que es justo lo que este repositorio no
   admite. `uptime` en 100 y los incrementos en 0 significan «no declarado», y
   la pantalla lo dice. El horizonte es lo único con un valor de arranque
   (10 años) porque es un rango de despliegue, no un supuesto del negocio. */
export function ctrlNuevo(parcial = {}) {
  const n = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
  return {
    inicio: typeof parcial.inicio === "string" ? parcial.inicio : "",
    horizonte: Math.max(1, Math.min(30, Math.round(n(parcial.horizonte, 10)))),
    ipc: n(parcial.ipc),
    precioKwh: n(parcial.precioKwh),
    precioPromo: n(parcial.precioPromo),
    mesesPromo: Math.max(0, Math.round(n(parcial.mesesPromo))),
    incPrecio: n(parcial.incPrecio),
    uptime: n(parcial.uptime, 100),
    perdidas: n(parcial.perdidas),
    /* Escenario de consumo seleccionado: 1 pesimista, 2 probable, 3 optimista.
       Son ALTERNATIVAS, no años consecutivos. Las cifras de cada uno viven en
       `cfg.escNSes/escNKwh/escNDmax` y no se copian aquí. */
    escenario: [1, 2, 3].includes(+parcial.escenario) ? +parcial.escenario : 2,
    sesionesIni: n(parcial.sesionesIni),
    rampaMeses: Math.max(0, Math.round(n(parcial.rampaMeses))),
    crecSesiones: n(parcial.crecSesiones),
    incCFE: n(parcial.incCFE),
    incMEM: n(parcial.incMEM),
    ahorroMem: n(parcial.ahorroMem),
    /* Mes a partir del cual el suministro pasa a mercado mayorista, en formato
       AAAA-MM. Vacío significa que no hay cambio previsto. Si el proyecto ya
       declara MEM en Configuración (`cfg.mem`), el MEM aplica desde el mes
       uno y esta fecha no se usa. */
    cambioMem: typeof parcial.cambioMem === "string" ? parcial.cambioMem : "",
  };
}

export function finanzasNueva(parcial = {}) {
  return {
    v: VERSION_FINANZAS,
    ctrl: ctrlNuevo(parcial.ctrl),
    opex: [],
    variables: [],
    inversionistas: [],
    notas: "",
  };
}

export function incrementoNuevo(parcial = {}) {
  const modo = Object.keys(MODOS_INCREMENTO).includes(parcial?.modo)
    ? parcial.modo : "ipc";
  const tasa = Number.isFinite(+parcial?.tasa) ? +parcial.tasa : 0;
  return { modo, tasa };
}

export function renglonOpexNuevo(parcial = {}) {
  return {
    id: parcial.id || idNuevo("opex"),
    concepto: parcial.concepto ?? "",
    categoria: parcial.categoria ?? "Otros",
    monto: numero(parcial.monto),
    activo: parcial.activo !== false,
    inc: incrementoNuevo(parcial.inc),
  };
}

/* Costo variable: un porcentaje de las VENTAS, no un monto mensual. La
   comisión de la concesionaria del modelo de referencia es de esta especie, y
   modelarla como monto fijo la haría no escalar con el negocio. */
export function variableNuevo(parcial = {}) {
  return {
    id: parcial.id || idNuevo("var"),
    concepto: parcial.concepto ?? "",
    pct: numero(parcial.pct),
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
   nada y una aportación negativa produciría participaciones sin sentido. */
function numero(v) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* Devuelve `null` cuando el proyecto no trae finanzas. No es un descuido: es
   la diferencia entre "este proyecto no tiene finanzas" y "tiene finanzas
   vacías", y de ella depende que abrir no persista nada. */
export function normalizarFinanzas(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const lista = (x) => (Array.isArray(x) ? x.filter((r) => r && typeof r === "object") : []);
  return {
    // Lo que esta versión no conoce se conserva; lo de abajo lo sobreescribe.
    ...raw,
    v: VERSION_FINANZAS,
    ctrl: ctrlNuevo(raw.ctrl),
    opex: lista(raw.opex).map((r) => ({ ...r, ...renglonOpexNuevo(r) })),
    variables: lista(raw.variables).map((r) => ({ ...r, ...variableNuevo(r) })),
    inversionistas: lista(raw.inversionistas).map((r) => ({ ...r, ...inversionistaNuevo(r) })),
    notas: typeof raw.notas === "string" ? raw.notas : "",
  };
}

/* Vacío significa: no hay nada que valga la pena escribir en el proyecto. Un
   `ctrl` en sus valores de arranque no cuenta como captura; si contara,
   entrar a la sección bastaría para modificar el proyecto. */
export function finanzasVacias(f) {
  if (!f) return true;
  if ((f.opex || []).length) return false;
  if ((f.variables || []).length) return false;
  if ((f.inversionistas || []).length) return false;
  if (String(f.notas || "").trim()) return false;
  return !ctrlCapturado(f.ctrl);
}

/* `ctrl` cuenta como capturado cuando difiere de los valores de arranque. Se
   compara contra `ctrlNuevo()` en vez de listar campos a mano para que agregar
   un supuesto nuevo no se olvide aquí. */
export function ctrlCapturado(ctrl) {
  if (!ctrl) return false;
  const base = ctrlNuevo();
  return Object.keys(base).some((k) => ctrl[k] !== undefined && ctrl[k] !== base[k]);
}
