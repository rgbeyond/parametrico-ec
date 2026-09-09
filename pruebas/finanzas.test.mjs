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
