/* El modelo financiero P0, sin navegador (issue #7).
   ==================================================

   Aquí se prueba la aritmética y la frontera de datos: OPEX, participaciones,
   brecha de fondeo, compatibilidad del estado guardado y qué puede salir en la
   vista de inversionista. Nada de esto necesita pantalla, y por eso corre en
   `npm test`, que tiene que poder ejecutarse en cualquier parte.

   Lo que NO se puede probar aquí —que la cifra de CAPEX de la sección
   Finanzas sea la misma que pinta el presupuesto— se prueba en el navegador,
   en `pruebas-navegador/ui_finanzas.test.mjs`, que es el único sitio donde
   existen las dos pantallas contra las que comparar.
*/

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizarFinanzas, finanzasNueva, finanzasVacias,
  renglonOpexNuevo, inversionistaNuevo, VERSION_FINANZAS } from "../src/lib/finanzas/estado.js";
import { CATEGORIAS_OPEX, resumenOpex } from "../src/lib/finanzas/opex.js";
import { resumenInversionistas } from "../src/lib/finanzas/inversionistas.js";
import { snapshotInversionista, CAMPOS_SNAPSHOT } from "../src/lib/finanzas/snapshot.js";
import { vistaInversionistaHTML } from "../src/lib/finanzas/vista.js";
import { finanzasDemo } from "../src/lib/finanzas/demo.js";

const OPEX = [
  { id: "a", concepto: "Operación en sitio", categoria: "Personal", monto: 120000, activo: true },
  { id: "b", concepto: "Renta del predio", categoria: "Renta / predial", monto: 45000, activo: true },
  { id: "c", concepto: "Mantenimiento", categoria: "Mantenimiento", monto: 60000, activo: true },
  { id: "d", concepto: "Segundo concepto de personal", categoria: "Personal", monto: 30000, activo: true },
  { id: "e", concepto: "Gasto que todavía no arranca", categoria: "Marketing", monto: 999999, activo: false },
];

const INV = [
  { id: "i1", nombre: "Inversionista A", aportacion: 12000000, activo: true },
  { id: "i2", nombre: "Inversionista B", aportacion: 8000000, activo: true },
  { id: "i3", nombre: "Socio que se salió", aportacion: 5000000, activo: false },
];

// --- OPEX -------------------------------------------------------------------

test("el OPEX mensual suma sólo los renglones activos", () => {
  const o = resumenOpex(OPEX);
  assert.equal(o.mensual, 255000, "120000 + 45000 + 60000 + 30000");
  assert.equal(o.activos, 4);
  assert.equal(o.renglones, 5, "el inactivo sigue en la lista");
});

test("el OPEX anual es el mensual por doce", () => {
  const o = resumenOpex(OPEX);
  assert.equal(o.anual, o.mensual * 12);
  assert.equal(o.anual, 3060000);
});

test("la distribución por categoría cuadra con el total y agrega repetidas", () => {
  const o = resumenOpex(OPEX);
  const suma = o.porCategoria.reduce((a, c) => a + c.mensual, 0);
  assert.equal(suma, o.mensual, "las categorías tienen que sumar el total");
  const personal = o.porCategoria.find((c) => c.categoria === "Personal");
  assert.equal(personal.mensual, 150000, "los dos renglones de personal se agregan");
  assert.equal(personal.anual, 1800000);
  const pcts = o.porCategoria.reduce((a, c) => a + c.pct, 0);
  assert.ok(Math.abs(pcts - 1) < 1e-9, `los porcentajes suman ${pcts}, no 1`);
  assert.ok(!o.porCategoria.some((c) => c.categoria === "Marketing"),
    "una categoría cuyo único renglón está inactivo no aparece");
});

test("una lista vacía no divide entre cero", () => {
  const o = resumenOpex([]);
  assert.deepEqual(
    { mensual: o.mensual, anual: o.anual, cats: o.porCategoria.length },
    { mensual: 0, anual: 0, cats: 0 });
});

test("las nueve categorías del issue están, en su orden", () => {
  assert.deepEqual(CATEGORIAS_OPEX, ["Personal", "Renta / predial", "Seguridad",
    "Servicios / conectividad", "Mantenimiento", "Seguros", "Marketing",
    "Administración", "Otros"]);
});

test("el saneado de montos ocurre al entrar, no al sumar", () => {
  /* La conversión vive en `normalizarFinanzas`, en la puerta del estado, y no
     repartida por los módulos de cálculo: con dos conversiones distintas la
     pantalla y el archivo acabarían discrepando. `resumenOpex` recibe estado ya
     normalizado y trata como cero lo que no sea un número positivo. */
  const f = normalizarFinanzas({
    opex: [
      { id: "x", monto: "18,000", categoria: "Otros" },
      { id: "y", monto: -5000, categoria: "Otros" },
      { id: "z", monto: "no es un número", categoria: "Otros" },
    ],
  });
  assert.deepEqual(f.opex.map((r) => r.monto), [18000, 0, 0],
    "el texto se convierte, el negativo y la basura valen cero");
  assert.equal(resumenOpex(f.opex).mensual, 18000, "un negativo no resta del OPEX");
  assert.equal(resumenOpex([{ id: "q", monto: "18,000" }]).mensual, 0,
    "sin normalizar, un monto en texto no se adivina: vale cero");
});

// --- inversionistas ---------------------------------------------------------

test("la participación es la aportación entre el capital aportado", () => {
  const r = resumenInversionistas(INV, 48670755);
  assert.equal(r.aportado, 20000000, "el inactivo no aporta");
  assert.equal(r.activos, 2);
  assert.equal(r.inactivos, 1);
  const a = r.participantes.find((p) => p.nombre === "Inversionista A");
  assert.equal(a.participacion, 12000000 / 20000000);
  assert.equal(a.participacion, 0.6);
});

test("las participaciones suman exactamente uno", () => {
  const r = resumenInversionistas(INV, 48670755);
  assert.ok(Math.abs(r.sumaParticipaciones - 1) < 1e-12,
    `suman ${r.sumaParticipaciones}`);
});

test("faltante y excedente son excluyentes y cuadran con el CAPEX", () => {
  const falta = resumenInversionistas(INV, 30000000);
  assert.equal(falta.faltante, 10000000);
  assert.equal(falta.excedente, 0);
  assert.equal(falta.cobertura, 20000000 / 30000000);

  const sobra = resumenInversionistas(INV, 15000000);
  assert.equal(sobra.faltante, 0);
  assert.equal(sobra.excedente, 5000000);

  const justo = resumenInversionistas(INV, 20000000);
  assert.equal(justo.faltante, 0);
  assert.equal(justo.excedente, 0);
  assert.equal(justo.cobertura, 1);
});

test("sin aportaciones no hay participaciones ni división entre cero", () => {
  const r = resumenInversionistas([], 1000000);
  assert.equal(r.aportado, 0);
  assert.equal(r.sumaParticipaciones, 0);
  assert.equal(r.faltante, 1000000);
  assert.equal(r.cobertura, 0);
});

test("sin CAPEX la cobertura es cero y no infinito", () => {
  const r = resumenInversionistas(INV, 0);
  assert.equal(r.cobertura, 0);
  assert.equal(r.faltante, 0);
  assert.equal(r.excedente, 20000000);
});

test("el CAPEX no se recalcula: es el que se le pasa", () => {
  const r = resumenInversionistas(INV, 48670755);
  assert.equal(r.capexRequerido, 48670755);
});

// --- estado guardado --------------------------------------------------------

test("un proyecto sin finanzas devuelve null, no una estructura vacía", () => {
  /* Es la prueba que sostiene «abrir no persiste nada»: si esto devolviera un
     objeto, `app.js` lo escribiría en el siguiente guardado del proyecto. */
  assert.equal(normalizarFinanzas(undefined), null);
  assert.equal(normalizarFinanzas(null), null);
  assert.equal(normalizarFinanzas("finanzas"), null);
  assert.equal(normalizarFinanzas([]), null);
});

test("un estado de finanzas se normaliza y conserva lo que no conoce", () => {
  const f = normalizarFinanzas({
    v: 1,
    opex: [{ id: "a", concepto: "Renta", categoria: "Renta / predial", monto: "45000" }],
    inversionistas: [{ id: "i1", nombre: "A", aportacion: 10 }],
    notas: "una nota",
    campoDeUnaVersionPosterior: { a: 1 },
  });
  assert.equal(f.v, VERSION_FINANZAS);
  assert.equal(f.opex[0].monto, 45000, "el texto se convierte a número");
  assert.equal(f.opex[0].activo, true, "activo por omisión");
  assert.deepEqual(f.campoDeUnaVersionPosterior, { a: 1 },
    "una llave que esta versión no conoce no puede desaparecer");
});

test("un renglón sin identificador recibe uno, y son distintos entre sí", () => {
  const f = normalizarFinanzas({ opex: [{ concepto: "uno" }, { concepto: "dos" }] });
  assert.ok(f.opex[0].id && f.opex[1].id);
  assert.notEqual(f.opex[0].id, f.opex[1].id);
});

test("finanzas vacías se reconocen, para no escribirlas en el proyecto", () => {
  assert.equal(finanzasVacias(null), true);
  assert.equal(finanzasVacias(finanzasNueva()), true);
  assert.equal(finanzasVacias({ opex: [renglonOpexNuevo({})], inversionistas: [] }), false);
  assert.equal(finanzasVacias({ opex: [], inversionistas: [inversionistaNuevo({})] }), false);
  assert.equal(finanzasVacias({ opex: [], inversionistas: [], notas: "algo" }), false);
});

test("los datos de demostración vienen marcados como demostración", () => {
  const d = finanzasDemo();
  assert.equal(d.demo, true, "sin esta marca la interfaz no puede avisar");
  assert.ok(d.opex.length > 0 && d.inversionistas.length > 0);
  assert.ok(/demostraci/i.test(d.notas), "las notas lo dicen también");
  // Nombres genéricos: el archivo de referencia trae personas reales.
  for (const i of d.inversionistas) {
    assert.match(i.nombre, /^Inversionista [A-Z]$/);
  }
  assert.equal(finanzasVacias(finanzasNueva()), true,
    "y un proyecto nuevo NO arranca con estos datos");
});

// --- snapshot de la vista de inversionista ----------------------------------

const armaSnapshot = (extra = {}) => {
  const o = resumenOpex(OPEX);
  const inv = resumenInversionistas(INV, 48670755);
  return snapshotInversionista({
    nombre: "Electrolinera Atlacomulco — Fase 1",
    ubicacion: "Atlacomulco, Estado de México",
    capexTotal: 48670755, deposito: 757944,
    clase: "Clase 4 — Propuesta preliminar / presupuestal",
    precision: "-22% / +35%",
    opex: o, fondeo: inv, participantes: inv.participantes,
    notas: "Supuestos de operación capturados para este proyecto.",
    version: "v0.13.0 · compilado 09 sept 2026",
    fecha: new Date("2026-09-09T18:00:00Z"),
    ...extra,
  });
};

test("el snapshot tiene exactamente los campos declarados", () => {
  assert.deepEqual(Object.keys(armaSnapshot()).sort(), [...CAMPOS_SNAPSHOT].sort());
});

test("el snapshot lleva el CAPEX que se le pasó, sin recalcular", () => {
  const s = armaSnapshot();
  assert.equal(s.capex.total, 48670755);
  assert.equal(s.fondeo.requerido, 48670755);
  assert.equal(s.fondeo.aportado, 20000000);
  assert.equal(s.fondeo.faltante, 28670755);
  assert.equal(s.opex.mensual, 255000);
  assert.equal(s.opex.anual, 3060000);
});

test("cada inversionista sale con tres campos y ninguno más", () => {
  const s = armaSnapshot();
  for (const p of s.inversionistas) {
    assert.deepEqual(Object.keys(p).sort(), ["aportacion", "nombre", "participacion"]);
  }
  assert.equal(s.inversionistas.length, 2, "los inactivos no llegan a la hoja");
});

test("el snapshot no puede arrastrar datos internos aunque se los pasen", () => {
  /* La función construye campo por campo y nunca hace `{...estado}`. Esta
     prueba mete basura interna por la puerta de al lado —un `cfg` completo,
     renglones del catálogo con precio unitario, comentarios y usuarios— y
     comprueba que nada de eso aparece en la salida. */
  const s = armaSnapshot({
    cfg: { tarifaDiv: "Centro Sur", cargoCap: 350.9, fee: 10 },
    rows: [{ c: "MT-015", pu: 1270500, r: "Provisión de $847/kVA" }],
    edits: { "MT-015": { pu: 999999 } },
    comentarios: [{ autor: "rg@beyond-ae.com", texto: "ojo con el trafo" }],
    usuarios: [{ correo: "rg@beyond-ae.com", rol: "admin" }],
    catalogo: ["MT-015", "CFE-005"],
  });
  const texto = JSON.stringify(s);
  for (const rastro of ["MT-015", "Centro Sur", "350.9", "999999", "1270500",
    "beyond-ae.com", "ojo con el trafo", "admin", "cargoCap", "edits"]) {
    assert.ok(!texto.includes(rastro),
      `el snapshot filtró «${rastro}»: la lista blanca dejó de serlo`);
  }
});

test("una fecha inválida no rompe el snapshot", () => {
  const s = armaSnapshot({ fecha: "no es una fecha" });
  assert.equal(s.meta.fecha, "");
  assert.equal(s.meta.fechaTxt, "");
});

// --- la hoja de inversionista -----------------------------------------------

test("la vista de inversionista no trae un solo control editable", () => {
  const html = vistaInversionistaHTML(armaSnapshot());
  for (const control of ["<input", "<select", "<button", "<textarea", "contenteditable"]) {
    assert.ok(!html.toLowerCase().includes(control),
      `la hoja de inversionista trae ${control}, y es de sólo lectura`);
  }
});

test("la hoja muestra lo que el issue pide que muestre", () => {
  const html = vistaInversionistaHTML(armaSnapshot());
  for (const dato of ["Atlacomulco", "Estado de México", "$48,670,755",
    "$255,000", "$3,060,000", "$20,000,000", "$28,670,755",
    "Inversionista A", "60.00%", "Clase 4", "v0.13.0",
    "Supuestos de operación capturados"]) {
    assert.ok(html.includes(dato), `falta «${dato}» en la hoja`);
  }
  assert.ok(html.includes("-22% / +35%"),
    "el rango de precisión no puede faltar: sin él la cifra parece cerrada");
});

test("la hoja escapa el marcado que venga en un nombre", () => {
  const html = vistaInversionistaHTML(armaSnapshot({ nombre: "<script>alert(1)</script>" }));
  assert.ok(!html.includes("<script>"), "un nombre no puede inyectar marcado");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("si las cifras son de demostración, la hoja lo dice en el documento", () => {
  /* El aviso tiene que estar EN la hoja, no sólo en la pantalla que la
     enmarca: la hoja es lo que alguien acabaría enseñando en una junta. */
  const conDemo = vistaInversionistaHTML(armaSnapshot({ demo: true }));
  assert.ok(conDemo.includes("Datos de demostración"));
  const sinDemo = vistaInversionistaHTML(armaSnapshot());
  assert.ok(!sinDemo.includes("Datos de demostración"));
});

test("sin datos capturados la hoja se pinta igual y lo dice", () => {
  const vacio = snapshotInversionista({ nombre: "Proyecto sin capturar", capexTotal: 1000 });
  const html = vistaInversionistaHTML(vacio);
  assert.ok(html.includes("Sin inversionistas capturados"));
  assert.ok(html.includes("Sin gasto de operación capturado"));
});

/* ==========================================================================
   ITERACIÓN P0.1: control general, escalamiento, costos variables y la
   proyección mensual.
   ========================================================================== */

import { ctrlNuevo, ctrlCapturado, variableNuevo,
  MODOS_INCREMENTO } from "../src/lib/finanzas/estado.js";
import { tasaEfectiva, montoEnMes, resumenVariables } from "../src/lib/finanzas/opex.js";
import { PLANTILLA_OPEX, opexDePlantilla } from "../src/lib/finanzas/plantilla.js";
import { proyectar, agregar, resumenPorAnio, aniosDeSerie, sesionesEnMes,
  costoUnitario, costoCFEDeTarifa, leerMes, DIAS_MES } from "../src/lib/finanzas/proyeccion.js";

// --- supuestos --------------------------------------------------------------

test("los supuestos arrancan neutros: ninguno trae una cifra plausible", () => {
  const c = ctrlNuevo();
  assert.equal(c.ipc, 0, "un IPC precargado seria una cifra inventada");
  assert.equal(c.precioKwh, 0);
  assert.equal(c.incPrecio, 0);
  assert.equal(c.ahorroMem, 0, "el material de referencia se contradice: no se elige por el usuario");
  assert.equal(c.perdidas, 0);
  assert.equal(c.uptime, 100, "neutro es 100%, no un 97% inventado");
  assert.equal(c.inicio, "");
  assert.equal(c.escenario, 2);
});

test("entrar a Control general y no capturar nada no cuenta como captura", () => {
  assert.equal(ctrlCapturado(ctrlNuevo()), false);
  assert.equal(ctrlCapturado(ctrlNuevo({ ipc: 4.5 })), true);
  assert.equal(finanzasVacias({ ...finanzasNueva(), ctrl: ctrlNuevo() }), true);
  assert.equal(finanzasVacias({ ...finanzasNueva(), ctrl: ctrlNuevo({ precioKwh: 8 }) }), false);
});

test("un finanzas v1 se actualiza a v2 sin perder nada", () => {
  const v1 = {
    v: 1,
    opex: [{ id: "a", concepto: "Renta", categoria: "Renta / predial", monto: 45000 }],
    inversionistas: [{ id: "i", nombre: "A", aportacion: 100 }],
    notas: "una nota",
    campoDeUnaVersionPosterior: { x: 1 },
  };
  const f = normalizarFinanzas(v1);
  assert.equal(f.v, 2);
  assert.equal(f.opex[0].monto, 45000);
  assert.deepEqual(f.opex[0].inc, { modo: "ipc", tasa: 0 },
    "un renglon v1 sin regla de incremento arranca heredando el IPC");
  assert.deepEqual(f.variables, [], "la coleccion nueva existe y esta vacia");
  assert.equal(f.ctrl.ipc, 0);
  assert.equal(f.notas, "una nota");
  assert.deepEqual(f.campoDeUnaVersionPosterior, { x: 1 });
});

// --- escalamiento -----------------------------------------------------------

const R = (inc, monto = 1000) => renglonOpexNuevo({ concepto: "x", monto, inc });

test("el IPC del proyecto se hereda, y la tasa propia lo sobreescribe", () => {
  assert.equal(tasaEfectiva(R({ modo: "ipc" }), 5), 5);
  assert.equal(tasaEfectiva(R({ modo: "propia", tasa: 12 }), 5), 12,
    "la tasa propia manda solo para ese concepto");
  assert.equal(tasaEfectiva(R({ modo: "ninguno" }), 5), 0);
  assert.deepEqual(Object.keys(MODOS_INCREMENTO), ["ipc", "propia", "ninguno"]);
});

test("el escalamiento ocurre en el aniversario, no cada mes", () => {
  const r = R({ modo: "ipc" });
  assert.equal(montoEnMes(r, 0, 10), 1000, "mes uno: sin incremento");
  assert.equal(montoEnMes(r, 11, 10), 1000, "mes doce: todavia el mismo ano");
  assert.equal(montoEnMes(r, 12, 10), 1100, "mes trece: primer aniversario");
  assert.equal(Math.round(montoEnMes(r, 24, 10)), 1210, "compone por ano, no por mes");
});

test("sin incremento el monto no se mueve nunca", () => {
  const r = R({ modo: "ninguno" });
  assert.equal(montoEnMes(r, 0, 10), 1000);
  assert.equal(montoEnMes(r, 60, 10), 1000);
});

test("un renglon inactivo no aporta aunque tenga tasa", () => {
  const r = renglonOpexNuevo({ monto: 1000, activo: false, inc: { modo: "propia", tasa: 50 } });
  assert.equal(montoEnMes(r, 24, 10), 0);
});

// --- plantilla --------------------------------------------------------------

test("la plantilla trae los conceptos del modelo de referencia y ningun monto", () => {
  const p = opexDePlantilla();
  assert.equal(p.length, 13);
  assert.equal(PLANTILLA_OPEX.length, 13);
  const nombres = p.map((r) => r.concepto);
  for (const esperado of ["Sueldo Encargado(s)", "Sueldo Supervisor", "Contador",
    "Guardias Seguridad", "Publicidad", "Internet", "Agua", "Renta", "Predial",
    "Papelería", "Despensa", "Seguros y Fianzas", "Otros"]) {
    assert.ok(nombres.includes(esperado), `falta ${esperado}`);
  }
  assert.ok(p.every((r) => r.monto === 0),
    "una plantilla con montos convertiria el supuesto de otro proyecto en el default de todos");
  assert.ok(p.every((r) => r.inc.modo === "ipc"));
  assert.equal(new Set(p.map((r) => r.id)).size, 13, "identificadores distintos");
});

// --- costos variables -------------------------------------------------------

test("los costos variables son porcentaje de ventas, no monto", () => {
  const v = resumenVariables([
    variableNuevo({ concepto: "Comisiones Concesionaria", pct: 15 }),
    variableNuevo({ concepto: "Fee de O&M", pct: 7 }),
    variableNuevo({ concepto: "Uno apagado", pct: 99, activo: false }),
  ]);
  assert.equal(v.pctTotal, 22);
  assert.equal(v.activos, 2);
});

// --- proyección -------------------------------------------------------------

const TARIFA = { costoCFE: 2, cargoCap: 350.9, cargoDist: 221.09, cargoFijo: 264.38, fc: 0.57 };
const CTRL = ctrlNuevo({
  inicio: "2027-01", horizonte: 3, ipc: 10, precioKwh: 10, incPrecio: 0,
  uptime: 100, perdidas: 0, escenario: 2, sesionesIni: 0, rampaMeses: 0,
  crecSesiones: 0, incCFE: 0, incMEM: 0, ahorroMem: 50, cambioMem: "",
});
const ESC = { sesiones: 10, kwhSesion: 100, dmax: 500 };
const proy = (over = {}) => proyectar({
  ctrl: { ...CTRL, ...(over.ctrl || {}) },
  opex: over.opex ?? [], variables: over.variables ?? [],
  escenario: over.escenario ?? ESC, tarifa: over.tarifa ?? TARIFA,
  memInicial: over.memInicial ?? false,
  generacion: over.generacion ?? 0, potDiseno: over.potDiseno ?? 0,
  meses: over.meses ?? 36,
});

test("la proyeccion entrega doce meses por ano y los etiqueta bien", () => {
  const s = proy();
  assert.equal(s.length, 36);
  const anios = aniosDeSerie(s);
  assert.deepEqual(anios, [2027, 2028, 2029]);
  for (const a of anios) {
    assert.equal(s.filter((x) => x.anio === a).length, 12, `el ano ${a} no trae doce meses`);
  }
  assert.equal(s[0].etiqueta, "Ene 2027");
  assert.equal(s[13].etiqueta, "Feb 2028");
});

test("ventas = kWh vendidos por precio", () => {
  const x = proy()[0];
  assert.equal(x.kwhDia, 10 * 100, "sesiones por kWh por sesion, al 100% de uptime");
  assert.ok(Math.abs(x.kwhMes - 1000 * DIAS_MES) < 1e-9);
  assert.equal(x.precio, 10);
  assert.ok(Math.abs(x.ventas - x.kwhMes * x.precio) < 1e-9);
});

test("el uptime recorta la energia vendida", () => {
  const x = proy({ ctrl: { uptime: 50 } })[0];
  assert.equal(x.kwhDia, 500);
});

test("EBITDA = utilidad bruta menos variables menos OPEX fijo", () => {
  const s = proy({
    opex: [renglonOpexNuevo({ concepto: "Renta", monto: 20000, inc: { modo: "ninguno" } })],
    variables: [variableNuevo({ concepto: "Comision", pct: 10 })],
  });
  const x = s[0];
  assert.ok(Math.abs(x.utilidadBruta - (x.ventas - x.costoElectricidad)) < 1e-9);
  assert.ok(Math.abs(x.costoVariable - x.ventas * 0.10) < 1e-9,
    "la comision escala con las ventas");
  assert.equal(x.opexFijo, 20000);
  assert.ok(Math.abs(x.ebitda - (x.utilidadBruta - x.costoVariable - x.opexFijo)) < 1e-9);
  assert.ok(Math.abs(x.ebitda - (x.ventas - x.egresos)) < 1e-9);
  assert.ok(Math.abs(x.margen - x.ebitda / x.ventas) < 1e-12);
});

test("el OPEX fijo de la serie escala en el aniversario", () => {
  const s = proy({ opex: [renglonOpexNuevo({ monto: 1000, inc: { modo: "ipc" } })] });
  assert.equal(s[0].opexFijo, 1000);
  assert.equal(s[11].opexFijo, 1000);
  assert.equal(s[12].opexFijo, 1100, "IPC 10% en el primer aniversario");
});

test("el costo de electricidad son energia, cargos de demanda y cargo fijo", () => {
  const x = proy()[0];
  assert.ok(Math.abs(x.kwhComprado - x.kwhMes) < 1e-9, "sin perdidas ni generacion");
  assert.ok(Math.abs(x.costoEnergia - x.kwhComprado * x.costoKwh) < 1e-9);
  const dCalc = x.kwhComprado / (24 * DIAS_MES * TARIFA.fc);
  const esperada = Math.min(ESC.dmax, dCalc);
  assert.ok(Math.abs(x.demandaFact - esperada) < 1e-9,
    "la demanda facturable es la menor entre la medida y la calculada");
  const cargos = esperada * (TARIFA.cargoCap + TARIFA.cargoDist) + TARIFA.cargoFijo;
  assert.ok(Math.abs(x.cargosDemanda - cargos) < 1e-9);
  assert.ok(Math.abs(x.costoElectricidad - (x.costoEnergia + cargos)) < 1e-9);
});

test("las perdidas hacen comprar mas energia de la que se vende", () => {
  const x = proy({ ctrl: { perdidas: 10 } })[0];
  assert.ok(Math.abs(x.kwhComprado - x.kwhMes / 0.9) < 1e-6);
  assert.ok(Math.abs(x.kwhPerdido - (x.kwhComprado - x.kwhMes)) < 1e-6);
});

test("la generacion desplaza consumo y el excedente se reporta, no desaparece", () => {
  const chico = proy({ generacion: 1000 })[0];
  assert.ok(Math.abs(chico.kwhComprado - (chico.kwhMes - 1000)) < 1e-6);
  assert.equal(chico.excedenteFV, 0);
  const grande = proy({ generacion: 999999 })[0];
  assert.equal(grande.kwhComprado, 0);
  assert.ok(grande.excedenteFV > 0,
    "el excedente tiene que verse: si no, parece que la energia se evaporo");
  assert.ok(Math.abs(grande.generacion + grande.excedenteFV - 999999) < 1e-6);
});

test("el techo fisico de potencia recorta y lo recortado se reporta", () => {
  // 10 sesiones x 100 kWh = 1,000 kWh/dia; con 20 kW de diseno el techo es 480.
  const x = proy({ potDiseno: 20 })[0];
  assert.equal(x.kwhDia, 480);
  assert.equal(x.castigoKwhDia, 520);
  const libre = proy({ potDiseno: 0 })[0];
  assert.equal(libre.castigoKwhDia, 0, "sin demanda de diseno no hay techo que aplicar");
});

test("cambiar de escenario cambia la proyeccion", () => {
  const a = proy({ escenario: { sesiones: 10, kwhSesion: 100, dmax: 500 } })[0];
  const b = proy({ escenario: { sesiones: 20, kwhSesion: 100, dmax: 900 } })[0];
  assert.equal(b.kwhMes, a.kwhMes * 2);
  assert.ok(b.ventas > a.ventas);
});

test("el cambio de suministrador mueve el costo desde el mes configurado", () => {
  const s = proy({ ctrl: { cambioMem: "2028-01", ahorroMem: 50 } });
  assert.equal(s[11].suministrador, "CFE");
  assert.equal(s[12].suministrador, "MEM");
  assert.equal(s[11].costoKwh, 2, "CFE sin incremento declarado");
  assert.equal(s[12].costoKwh, 1, "MEM con 50% de ahorro sobre el costo de CFE");
});

test("un proyecto que ya declara MEM arranca en MEM", () => {
  const s = proy({ memInicial: true, ctrl: { ahorroMem: 20 } });
  assert.equal(s[0].suministrador, "MEM");
  assert.ok(Math.abs(s[0].costoKwh - 1.6) < 1e-9);
});

test("el precio promocional aplica sus meses y luego cede al normal", () => {
  const s = proy({ ctrl: { precioPromo: 5, mesesPromo: 3 } });
  assert.equal(s[0].precio, 5);
  assert.equal(s[2].precio, 5);
  assert.equal(s[3].precio, 10);
  assert.equal(s[0].promo, true);
  assert.equal(s[3].promo, false);
});

test("el precio de venta y el costo de CFE escalan por aniversario", () => {
  const s = proy({ ctrl: { incPrecio: 10, incCFE: 20 } });
  assert.equal(s[0].precio, 10);
  assert.equal(s[12].precio, 11);
  assert.equal(s[0].costoKwh, 2);
  assert.ok(Math.abs(s[12].costoKwh - 2.4) < 1e-9);
});

test("la rampa lleva del arranque al objetivo del escenario", () => {
  assert.equal(sesionesEnMes(0, { sesionesIni: 0, objetivo: 12, rampaMeses: 12 }), 1);
  assert.equal(sesionesEnMes(11, { sesionesIni: 0, objetivo: 12, rampaMeses: 12 }), 12);
  assert.equal(sesionesEnMes(24, { sesionesIni: 0, objetivo: 12, rampaMeses: 12 }), 12);
  // Los escenarios son alternativas, no anos: sin crecimiento, no crece solo.
  assert.equal(sesionesEnMes(60, { objetivo: 12 }), 12);
  assert.equal(sesionesEnMes(12, { objetivo: 10, crecSesiones: 50 }), 15);
});

test("el agregado anual cuadra con sus meses", () => {
  const s = proy({ opex: [renglonOpexNuevo({ monto: 1000, inc: { modo: "ninguno" } })] });
  const a2027 = s.filter((x) => x.anio === 2027);
  const g = agregar(a2027);
  assert.equal(g.meses, 12);
  assert.ok(Math.abs(g.ventas - a2027.reduce((x, y) => x + y.ventas, 0)) < 1e-6);
  assert.ok(Math.abs(g.ebitda - a2027.reduce((x, y) => x + y.ebitda, 0)) < 1e-6);
  assert.ok(Math.abs(g.precio - g.ventas / g.kwhMes) < 1e-9,
    "el precio del ano es ventas entre kWh, no el promedio de doce precios");
  assert.equal(g.opexFijo, 12000);
});

test("el resumen por ano trae un renglon por ano calendario", () => {
  const r = resumenPorAnio(proy());
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.anio), [2027, 2028, 2029]);
});

test("sin fecha de inicio la proyeccion arranca en el mes que se le indique", () => {
  const s = proyectar({ ctrl: ctrlNuevo({ precioKwh: 1 }), escenario: ESC,
    tarifa: TARIFA, meses: 2, hoy: new Date("2030-05-15T00:00:00Z") });
  assert.equal(s[0].anio, 2030);
  assert.equal(s[0].mesNum, 4);
});

test("el costo unitario de CFE sale del reparto y los cargos capturados", () => {
  const c = costoCFEDeTarifa({ pctPunta: 20, pctInterm: 60, pctBase: 20,
    enPunta: 1.6703, enInterm: 1.4539, enBase: 0.7422, otrosKwh: 0.1946 });
  // 0.2*1.6703 + 0.6*1.4539 + 0.2*0.7422 = 1.35484, mas 0.1946 de otros cargos
  assert.ok(Math.abs(c - 1.54944) < 1e-5, `dio ${c}`);
  assert.equal(costoCFEDeTarifa({}), 0, "sin reparto no se inventa un costo");
  const desbalanceado = costoCFEDeTarifa({ pctPunta: 50, pctBase: 50,
    enPunta: 2, enBase: 0, otrosKwh: 0 });
  assert.equal(desbalanceado, 1, "un reparto que no suma 100 se normaliza");
});

test("leerMes acepta AAAA-MM y rechaza lo demas", () => {
  assert.deepEqual(leerMes("2027-03"), { anio: 2027, mes: 2 });
  assert.equal(leerMes(""), null);
  assert.equal(leerMes("marzo"), null);
  assert.equal(leerMes("2027-13"), null);
});

test("costoUnitario no inventa un costo cuando no hay tarifa", () => {
  assert.equal(costoUnitario(0, { costoCFE: 0 }), 0);
});

// --- el snapshot con la proyeccion ------------------------------------------

test("el snapshot lleva el resumen anual y solo cinco cifras por ano", () => {
  const s = snapshotInversionista({
    nombre: "P", capexTotal: 100,
    operacion: resumenPorAnio(proy({
      opex: [renglonOpexNuevo({ monto: 1000, inc: { modo: "ninguno" } })],
      variables: [variableNuevo({ concepto: "Comision", pct: 10 })],
    })),
  });
  assert.equal(s.operacion.length, 3);
  for (const a of s.operacion) {
    assert.deepEqual(Object.keys(a).sort(),
      ["anio", "costoEnergia", "ebitda", "margen", "opex", "ventas"]);
  }
  assert.deepEqual(Object.keys(s).sort(), [...CAMPOS_SNAPSHOT].sort());
});

test("la serie mensual NO llega a la hoja de inversionista", () => {
  const s = snapshotInversionista({ nombre: "P", capexTotal: 100,
    operacion: resumenPorAnio(proy()) });
  const texto = JSON.stringify(s);
  for (const interno of ["demandaFact", "costoKwh", "sesionesDia", "kwhComprado",
    "cargosDemanda", "suministrador", "etiqueta"]) {
    assert.ok(!texto.includes(interno), `la hoja filtro ${interno}`);
  }
});
