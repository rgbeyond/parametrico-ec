/* Publicación versionada de la hoja de inversionista, sin navegador.
   ==================================================================

   Lo que se prueba aquí es la propiedad que hace útil a una publicación:
   que esté CONGELADA. Si publicar guardara una referencia al proyecto en vez
   de una copia, la hoja que se le enseñó a alguien el martes mostraría las
   cifras del miércoles, y nadie podría saber qué se enseñó.

   Y la otra mitad: que lo publicado siga respetando la lista blanca del
   snapshot. Una publicación es el objeto que algún día servirá un portal a
   alguien de fuera; si por ahí se colara un precio unitario, se colaría a un
   tercero.
*/

import { test } from "node:test";
import assert from "node:assert/strict";

import { CONTRATO, crearPublicacion, normalizarPublicaciones, ordenadas,
  ultimaPublicacion, contratoConocido, hayCambiosSinPublicar,
  paraEntrega } from "../src/lib/finanzas/publicacion.js";
import { snapshotInversionista, CAMPOS_SNAPSHOT } from "../src/lib/finanzas/snapshot.js";
import { normalizarFinanzas, finanzasNueva, finanzasVacias,
  VERSION_FINANZAS } from "../src/lib/finanzas/estado.js";

const snap = (over = {}) => snapshotInversionista({
  nombre: "Electrolinera Atlacomulco — Fase 1",
  ubicacion: "Atlacomulco, Estado de México",
  capexTotal: 48670755, deposito: 757944,
  clase: "Clase 4 — Propuesta preliminar / presupuestal",
  precision: "-22% / +35%",
  opex: { mensual: 255000, anual: 3060000, porCategoria: [] },
  fondeo: { aportado: 20000000, faltante: 28670755, excedente: 0, cobertura: 0.41 },
  participantes: [{ nombre: "Inversionista A", aportacion: 12000000, participacion: 0.6 }],
  operacion: [{ anio: 2027, ventas: 2790720, costoElectricidad: 3173,
    opexFijo: 0, costoVariable: 0, ebitda: 2787547, margen: 0.9989 }],
  notas: "Supuestos capturados para este proyecto.",
  version: "v0.15.0 · compilado 24 sept 2026",
  fecha: new Date("2026-09-24T18:00:00Z"),
  ...over,
});

const pub = (over = {}) => crearPublicacion({
  snapshot: snap(), etiqueta: "Comité de septiembre",
  version: "v0.15.0 · compilado 24 sept 2026", escenario: 2,
  fecha: new Date("2026-09-24T18:00:00Z"), ...over,
});

// --- congelar ---------------------------------------------------------------

test("publicar congela: mutar el snapshot después no toca lo publicado", () => {
  const vivo = snap();
  const p = crearPublicacion({ snapshot: vivo, version: "v1" });
  vivo.capex.total = 999;
  vivo.operacion[0].ebitda = 1;
  assert.equal(p.snapshot.capex.total, 48670755,
    "si esto cambia, publicar guardó una referencia y no una copia");
  assert.equal(p.snapshot.operacion[0].ebitda, 2787547);
});

test("una publicación declara cuándo, con qué versión y con qué escenario", () => {
  const p = pub();
  assert.equal(p.contrato, CONTRATO);
  assert.equal(p.publicado, "2026-09-24T18:00:00.000Z");
  assert.ok(p.publicadoTxt.includes("2026"));
  assert.equal(p.etiqueta, "Comité de septiembre");
  assert.equal(p.version, "v0.15.0 · compilado 24 sept 2026");
  assert.equal(p.escenario, 2);
  assert.ok(p.id);
});

test("dos publicaciones seguidas no comparten identificador", () => {
  assert.notEqual(pub().id, pub().id);
});

test("sin hoja no hay publicación: se levanta el error en vez de guardar vacío", () => {
  assert.throws(() => crearPublicacion({}), /No hay hoja que publicar/);
  assert.throws(() => crearPublicacion({ snapshot: null }), /No hay hoja que publicar/);
});

test("una fecha inválida no rompe la publicación", () => {
  const p = pub({ fecha: "cuando sea" });
  assert.equal(p.publicado, "");
  assert.equal(p.publicadoTxt, "");
});

// --- la lista ---------------------------------------------------------------

test("las publicaciones se ordenan de la más reciente a la más vieja", () => {
  const vieja = pub({ fecha: new Date("2026-01-01T00:00:00Z"), etiqueta: "vieja" });
  const nueva = pub({ fecha: new Date("2026-12-01T00:00:00Z"), etiqueta: "nueva" });
  const l = ordenadas([vieja, nueva]);
  assert.equal(l[0].etiqueta, "nueva");
  assert.equal(ultimaPublicacion([vieja, nueva]).etiqueta, "nueva");
  assert.equal(ultimaPublicacion([]), null);
});

test("una publicación sin hoja se descarta en vez de pintar una vacía", () => {
  const l = normalizarPublicaciones([pub(), { id: "x" }, null, "texto",
    { id: "y", snapshot: "no es un objeto" }]);
  assert.equal(l.length, 1);
});

test("una publicación hecha por una versión posterior se conserva tal cual", () => {
  const [p] = normalizarPublicaciones([{
    ...pub(), contrato: 7, campoQueEstaVersionNoConoce: { a: 1 },
  }]);
  assert.equal(p.contrato, 7, "mentir sobre el contrato sería peor que no saber leerla");
  assert.deepEqual(p.campoQueEstaVersionNoConoce, { a: 1 });
  assert.equal(contratoConocido(p), false, "y la interfaz tiene que saber que no la entiende");
  assert.equal(contratoConocido(pub()), true);
});

test("normalizar una lista que no es lista devuelve una lista vacía", () => {
  assert.deepEqual(normalizarPublicaciones(undefined), []);
  assert.deepEqual(normalizarPublicaciones({ a: 1 }), []);
});

// --- cambios sin publicar ---------------------------------------------------

test("la hora del render no cuenta como un cambio", () => {
  /* `meta.fecha` se rellena con `new Date()` en cada pintado. Sin excluirla,
     la pantalla diría «hay cambios sin publicar» un milisegundo después de
     publicar, y el aviso dejaría de significar nada. */
  const p = pub();
  const otroMomento = snap({ fecha: new Date("2026-11-30T23:59:00Z") });
  assert.equal(hayCambiosSinPublicar(otroMomento, [p]), false);
});

test("un cambio de cifra sí cuenta como un cambio", () => {
  const p = pub();
  assert.equal(hayCambiosSinPublicar(snap({ capexTotal: 50000000 }), [p]), true);
  assert.equal(hayCambiosSinPublicar(snap({ notas: "otra cosa" }), [p]), true);
});

test("sin publicaciones no hay cambios sin publicar", () => {
  assert.equal(hayCambiosSinPublicar(snap(), []), false,
    "no se puede estar desfasado de algo que nunca se publicó");
});

test("la comparación es contra la ÚLTIMA publicación, no contra cualquiera", () => {
  const vieja = crearPublicacion({ snapshot: snap({ capexTotal: 1 }),
    fecha: new Date("2026-01-01T00:00:00Z") });
  const nueva = pub({ fecha: new Date("2026-12-01T00:00:00Z") });
  assert.equal(hayCambiosSinPublicar(snap(), [vieja, nueva]), false);
});

// --- lo que sale ------------------------------------------------------------

test("lo publicado sigue sin traer datos internos del proyecto", () => {
  /* Hereda la lista blanca del snapshot. La prueba se repite aquí a
     propósito: esto es lo que un portal serviría a alguien de fuera, así que
     la frontera se verifica también del lado de la publicación. */
  const p = pub({
    snapshot: snapshotInversionista({
      nombre: "P", capexTotal: 100,
      cfg: { tarifaDiv: "Centro Sur", cargoCap: 350.9 },
      rows: [{ c: "MT-015", pu: 1270500 }],
      comentarios: [{ autor: "rg@beyond-ae.com", texto: "ojo con el trafo" }],
      usuarios: [{ correo: "rg@beyond-ae.com", rol: "admin" }],
    }),
  });
  const texto = JSON.stringify(p);
  for (const rastro of ["MT-015", "Centro Sur", "1270500", "beyond-ae.com",
    "ojo con el trafo", "cargoCap", "tarifaDiv"]) {
    assert.ok(!texto.includes(rastro), `la publicación filtró «${rastro}»`);
  }
  assert.deepEqual(Object.keys(p.snapshot).sort(), [...CAMPOS_SNAPSHOT].sort());
});

test("lo que se entregaría a otro sistema es autocontenido y declarado", () => {
  const e = paraEntrega(pub());
  assert.deepEqual(Object.keys(e).sort(),
    ["contrato", "etiqueta", "id", "publicado", "snapshot", "version"]);
  assert.equal(e.contrato, CONTRATO);
  assert.equal(e.snapshot.proyecto.nombre, "Electrolinera Atlacomulco — Fase 1");
  assert.equal(paraEntrega(null), null);
  assert.equal(paraEntrega({ id: "x" }), null);
});

// --- el estado --------------------------------------------------------------

test("el estado financiero va por la versión 3 y guarda las publicaciones", () => {
  assert.equal(VERSION_FINANZAS, 3);
  const f = normalizarFinanzas({ v: 2, publicaciones: [pub()] });
  assert.equal(f.v, 3);
  assert.equal(f.publicaciones.length, 1);
  assert.equal(f.publicaciones[0].snapshot.capex.total, 48670755);
});

test("un finanzas v2 sin publicaciones se actualiza sin perder nada", () => {
  const f = normalizarFinanzas({
    v: 2,
    ctrl: { ipc: 4.5, precioKwh: 8.5 },
    opex: [{ id: "a", concepto: "Renta", monto: 45000 }],
    variables: [{ id: "v", concepto: "Comisión", pct: 15 }],
    notas: "nota",
    campoDeUnaVersionPosterior: { z: 1 },
  });
  assert.equal(f.v, 3);
  assert.deepEqual(f.publicaciones, [], "la colección nueva existe y está vacía");
  assert.equal(f.ctrl.ipc, 4.5);
  assert.equal(f.opex[0].monto, 45000);
  assert.equal(f.variables[0].pct, 15);
  assert.deepEqual(f.campoDeUnaVersionPosterior, { z: 1 });
});

test("una publicación cuenta como captura: el proyecto ya no está vacío", () => {
  assert.equal(finanzasVacias(finanzasNueva()), true);
  assert.equal(finanzasVacias({ ...finanzasNueva(), publicaciones: [pub()] }), false);
});
