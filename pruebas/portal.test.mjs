/* El modelo del portal de inversionistas, sin navegador (issue #9).
   =================================================================

   La prueba que importa es la negativa: se mete dentro del proyecto todo lo
   que NO puede salir —precios unitarios, catálogo, comentarios, usuarios,
   ediciones, campos administrativos— y se comprueba que no aparece ni en el
   modelo ni en el marcado. `modeloPortal()` construye campo por campo, así que
   lo que llegue de más tiene que quedarse fuera por construcción.

   Lo demás: que el CAPEX salga del proyecto y no de un cálculo nuevo, que un
   proyecto sin `estado.finanzas` se pinte sin inventar resultados, y que con
   publicación se enseñe la versión congelada tal cual.
*/

import { test } from "node:test";
import assert from "node:assert/strict";

import { modeloPortal, elegirPublicacion, versionesDisponibles,
  CAMPOS_PORTAL } from "../src/lib/portal/modelo.js";
import { portalHTML, seccionesVisibles } from "../src/lib/portal/vista.js";
import { CONTRATO, crearPublicacion } from "../src/lib/finanzas/publicacion.js";
import { snapshotInversionista } from "../src/lib/finanzas/snapshot.js";

/* Un proyecto con la forma del de Ecatepec: sin `estado.finanzas`, que es como
   está hoy en la base. Y con basura interna a propósito. */
const ECATEPEC = {
  id: "038f0972-16de-4c5c-830d-9b0729022c10",
  clave: "estacion-de-carga-ecatepec-dave-y7jy",
  nombre: "Estación de Carga Ecatepec (Dave)",
  ubicacion: "Ecatepec, Estado de México",
  creado_por: "8f1c3a52-0000-0000-0000-000000000001",
  actualizado_en: "2026-09-20T10:00:00.000Z",
  estado: {
    v: 1,
    total: 41250000,
    directo: 31000000,
    clase: "Propuesta preliminar / presupuestal",
    idd: 0.41,
    cfg: {
      nom: "Estación de Carga Ecatepec (Dave)", loc: "Ecatepec, Estado de México",
      modo: "coinv",
      grupos: [{ kw: 240, con: 2, q: 4 }, { kw: 120, con: 2, q: 2 }],
      kva: "1500", vmt: 23, vbt: 480, balanceo: 1, balanceoPct: 30,
      demCon: 0, mem: 0, sumin: "CFE Suministro Básico", tarifaCat: "GDMTH",
      tarifaDiv: "Valle de México Norte", tarifaMes: "2026-08",
      // Cargos de tarifa: internos, no salen al portal.
      cargoCap: 350.90, cargoDist: 221.09, enPunta: 1.6703, otrosKwh: 0.1946,
      kwp: 400, fvKwhKwp: 115, bess: 2, besskwh: 261, besskw: 125,
    },
    // Todo lo que sigue es interno y no puede salir.
    edits: { "MT-015": { pu: 1270500 } },
    genApproved: { "EVSE-240-2": 987654321 },
    genEdits: { "CFE-005": 4650000 },
    catalogo: [{ c: "MT-015", pu: 847000, r: "Provisión de $847/kVA" }],
    comentarios: [{ autor: "rg@beyond-ae.com", texto: "ojo con el trafo" }],
    usuarios: [{ correo: "dave@beyond-ae.com", rol: "admin" }],
  },
};

const conPublicacion = () => crearPublicacion({
  snapshot: snapshotInversionista({
    nombre: "Estación de Carga Ecatepec (Dave)",
    ubicacion: "Ecatepec, Estado de México",
    capexTotal: 41250000,
    opex: { mensual: 180000, anual: 2160000, porCategoria: [] },
    fondeo: { aportado: 20000000, faltante: 21250000, excedente: 0, cobertura: 0.48 },
    participantes: [{ nombre: "Inversionista A", aportacion: 20000000, participacion: 1 }],
    operacion: [{ anio: 2027, ventas: 3200000, costoElectricidad: 900000,
      opexFijo: 2160000, costoVariable: 480000, ebitda: -340000, margen: -0.10 }],
    notas: "Supuestos capturados para este proyecto.",
    version: "v0.16.0",
  }),
  etiqueta: "Comité", version: "v0.16.0", escenario: 2,
  fecha: new Date("2026-09-24T18:00:00Z"),
});

// --- la lista blanca --------------------------------------------------------

test("el modelo tiene exactamente los campos declarados", () => {
  const m = modeloPortal(ECATEPEC);
  assert.deepEqual(Object.keys(m).sort(), [...CAMPOS_PORTAL].sort());
});

test("el modelo no deja salir nada interno del proyecto", () => {
  const m = modeloPortal(ECATEPEC, conPublicacion());
  const texto = JSON.stringify(m);
  for (const rastro of [
    "MT-015", "EVSE-240-2", "CFE-005", "1270500", "987654321", "4650000",
    "847000", "Provisión de", "beyond-ae.com", "ojo con el trafo", "admin",
    "cargoCap", "350.9", "221.09", "1.6703", "otrosKwh",
    "edits", "genApproved", "genEdits", "catalogo", "comentarios", "usuarios",
    "creado_por", "estacion-de-carga-ecatepec-dave-y7jy",
  ]) {
    assert.ok(!texto.includes(rastro),
      `el modelo del portal filtró «${rastro}»`);
  }
});

test("el marcado tampoco los enseña", () => {
  const html = portalHTML(modeloPortal(ECATEPEC, conPublicacion()));
  for (const rastro of ["MT-015", "1270500", "beyond-ae.com", "ojo con el trafo",
    "350.9", "221.09", "estacion-de-carga-ecatepec-dave-y7jy"]) {
    assert.ok(!html.includes(rastro), `el marcado del portal filtró «${rastro}»`);
  }
});

test("el portal no tiene un solo control editable", () => {
  const html = portalHTML(modeloPortal(ECATEPEC, conPublicacion()));
  for (const control of ["<input", "<select", "<textarea", "<button",
    "contenteditable", "<form"]) {
    assert.ok(!html.toLowerCase().includes(control),
      `el portal trae ${control}, y es de sólo lectura`);
  }
});

test("un proyecto que no es un objeto no produce modelo", () => {
  assert.equal(modeloPortal(null), null);
  assert.equal(modeloPortal("proyecto"), null);
  assert.equal(portalHTML(null), "");
});

// --- el CAPEX no se recalcula -----------------------------------------------

test("la inversión sale del proyecto, no de un cálculo nuevo", () => {
  const m = modeloPortal(ECATEPEC);
  assert.equal(m.inversion.total, 41250000, "es `estado.total`, tal cual");
  assert.equal(m.inversion.directo, 31000000);
  assert.equal(m.inversion.clase, "Propuesta preliminar / presupuestal");
  assert.equal(m.inversion.indice, 0.41);
});

test("sin cifra de inversión guardada se reporta pendiente, no cero", () => {
  /* Un cero se lee como resultado. Aquí sería un hueco, y decir «pendiente»
     es la única forma honesta de pintarlo. */
  const sinTotal = { ...ECATEPEC, estado: { ...ECATEPEC.estado, total: undefined, directo: undefined } };
  const m = modeloPortal(sinTotal);
  assert.equal(m.inversion.total, null);
  assert.equal(m.inversion.directo, null);
  const html = portalHTML(m);
  assert.ok(html.includes("Pendiente"));
  assert.ok(!html.includes("$0"), "no puede aparecer un cero como si fuera la inversión");
});

// --- derivaciones técnicas --------------------------------------------------

test("las cifras técnicas son las mismas que las del estimador", () => {
  const m = modeloPortal(ECATEPEC).tecnico;
  assert.equal(m.equipos, 6, "4 de 240 kW más 2 de 120 kW");
  assert.equal(m.puntos, 12, "dos conectores cada uno");
  assert.equal(m.potenciaInstalada, 1200, "4×240 + 2×120");
  assert.equal(m.potenciaDiseno, 840, "menos el 30% reservado al balanceo");
  assert.deepEqual(m.balanceo, { activo: true, pct: 30 });
  assert.equal(m.transformador.kva, 1500);
  assert.equal(m.generacion.kwp, 400);
  assert.equal(m.almacenamiento.modulos, 2);
  assert.equal(m.almacenamiento.kwh, 522, "261 kWh por módulo");
});

test("la demanda contratada dice si es declarada o el piso de tarifa", () => {
  const piso = modeloPortal(ECATEPEC).tecnico.demandaContratada;
  assert.equal(piso.kw, 720, "60% de los 1,200 kW conectados");
  assert.equal(piso.declarada, false);

  const declarada = modeloPortal({
    ...ECATEPEC,
    estado: { ...ECATEPEC.estado, cfg: { ...ECATEPEC.estado.cfg, demCon: 900 } },
  }).tecnico.demandaContratada;
  assert.equal(declarada.kw, 900);
  assert.equal(declarada.declarada, true);
});

test("la tarifa viaja como procedencia, nunca como cargos", () => {
  const s = modeloPortal(ECATEPEC).tecnico.suministro;
  assert.deepEqual(Object.keys(s).sort(),
    ["categoria", "division", "mercadoMayorista", "mes", "suministrador"]);
  assert.equal(s.division, "Valle de México Norte");
});

test("un proyecto sin configuración no revienta", () => {
  const m = modeloPortal({ id: "x", nombre: "Vacío", estado: {} });
  assert.equal(m.tecnico.equipos, 0);
  assert.equal(m.tecnico.potenciaInstalada, 0);
  assert.equal(m.inversion.total, null);
  assert.ok(portalHTML(m).includes("Vacío"));
  const sinEstado = modeloPortal({ id: "y", nombre: "Sin estado" });
  assert.equal(sinEstado.tecnico.equipos, 0);
});

// --- los dos estados --------------------------------------------------------

test("sin publicación financiera no se inventan resultados", () => {
  const m = modeloPortal(ECATEPEC);
  assert.equal(m.finanzas, null);
  const html = portalHTML(m);
  assert.ok(html.includes("Proyección financiera pendiente de publicación"));
  /* El aviso NOMBRA lo que no está enseñando —ventas, costos, EBITDA—, y eso
     es correcto: decirlo es más honesto que callarlo. Lo que no puede haber es
     una sola CIFRA financiera, ni siquiera un cero. */
  const proyeccion = html.split('data-seccion="proyeccion"')[1].split("</section>")[0];
  const inversionistas = html.split('data-seccion="inversionistas"')[1].split("</section>")[0];
  assert.equal(proyeccion.replace(/[^\w$]/g, ""), "hidden",
    "la sección de proyección tiene que quedar vacía");
  assert.equal(inversionistas.replace(/[^\w$]/g, ""), "hidden",
    "la de inversionistas también");
  assert.ok(!/\$\s?\d/.test(proyeccion + inversionistas),
    "sin publicación no puede aparecer ni una cifra en pesos");
});

test("sin publicación, Proyección e Inversionistas no se ofrecen", () => {
  const sin = seccionesVisibles(modeloPortal(ECATEPEC)).map((s) => s.id);
  assert.deepEqual(sin, ["resumen", "proyecto"],
    "una pestaña que abre en blanco es peor que una pestaña que no está");
  const con = seccionesVisibles(modeloPortal(ECATEPEC, conPublicacion())).map((s) => s.id);
  assert.deepEqual(con, ["resumen", "proyecto", "proyeccion", "inversionistas"]);
});

test("con publicación se enseña la versión congelada, sin recalcularla", () => {
  const pub = conPublicacion();
  const m = modeloPortal(ECATEPEC, pub);
  assert.equal(m.finanzas.etiqueta, "Comité");
  assert.equal(m.finanzas.contrato, CONTRATO);
  assert.deepEqual(m.finanzas.snapshot.operacion, pub.snapshot.operacion,
    "el portal renderiza la publicación tal cual: no la vuelve a calcular");
  const html = portalHTML(m);
  assert.ok(html.includes("$3,200,000"), "las ventas publicadas");
  assert.ok(html.includes("-$340,000") || html.includes("$-340,000"),
    "y un EBITDA negativo se enseña como es");
  assert.ok(html.includes("Proyección financiera publicada"));
});

test("mutar el proyecto después no toca el modelo ya construido", () => {
  const pub = conPublicacion();
  const m = modeloPortal(ECATEPEC, pub);
  pub.snapshot.operacion[0].ebitda = 99999999;
  assert.equal(m.finanzas.snapshot.operacion[0].ebitda, -340000);
});

// --- selección de versión ---------------------------------------------------

test("sin id se elige la publicación más reciente", () => {
  const vieja = crearPublicacion({ snapshot: conPublicacion().snapshot,
    etiqueta: "vieja", fecha: new Date("2026-01-01T00:00:00Z") });
  const nueva = crearPublicacion({ snapshot: conPublicacion().snapshot,
    etiqueta: "nueva", fecha: new Date("2026-12-01T00:00:00Z") });
  assert.equal(elegirPublicacion([vieja, nueva]).etiqueta, "nueva");
  assert.equal(elegirPublicacion([vieja, nueva], vieja.id).etiqueta, "vieja");
  assert.equal(elegirPublicacion([vieja, nueva], "no-existe"), null);
  assert.equal(elegirPublicacion([]), null);
});

test("una publicación con contrato desconocido no se pinta a medias", () => {
  const futura = { ...conPublicacion(), contrato: 99 };
  assert.equal(elegirPublicacion([futura]), null);
  assert.deepEqual(versionesDisponibles([futura]), []);
});

test("el selector de versiones sólo lleva lo que necesita", () => {
  const v = versionesDisponibles([conPublicacion()]);
  assert.equal(v.length, 1);
  assert.deepEqual(Object.keys(v[0]).sort(), ["etiqueta", "id", "publicadoTxt"]);
  assert.ok(!JSON.stringify(v).includes("snapshot"),
    "la lista del selector no puede arrastrar los snapshots completos");
});

// --- metadatos --------------------------------------------------------------

test("el modelo lleva el identificador del proyecto y la versión del build", () => {
  const m = modeloPortal(ECATEPEC, null,
    { ahora: new Date("2026-09-24T18:00:00Z"), version: "v0.16.0" });
  assert.equal(m.meta.proyectoId, "038f0972-16de-4c5c-830d-9b0729022c10");
  assert.equal(m.meta.version, "v0.16.0");
  assert.ok(m.meta.generadoTxt.includes("2026"));
  assert.deepEqual(Object.keys(m.meta).sort(),
    ["generado", "generadoTxt", "proyectoId", "version"]);
});

test("el nombre y la ubicación se escapan", () => {
  const html = portalHTML(modeloPortal({
    ...ECATEPEC, nombre: "<script>alert(1)</script>",
  }));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
});
