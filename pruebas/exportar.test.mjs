/* El exportador del catálogo del proyecto (issue #4), sin navegador.
   ==================================================================

   Lo que se prueba aquí es que el archivo dice EXACTAMENTE lo que se le dio:
   los renglones y los totales entran como entrada —los mismos que `build()` y
   `totals()` dejan en la app— y lo que se comprueba es que salen intactos, con
   el escapado correcto y sin renglones de más ni de menos.

   La equivalencia con lo que se ve en pantalla se prueba aparte, en el
   navegador (`pruebas-navegador/ui_exportar.test.mjs`), que es el único sitio
   donde existe una pantalla contra la que comparar.
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import { modeloExport, aCSV, documentoHTML, nombreArchivo, slug, campoCSV,
  COLUMNAS, TRATO } from "../src/lib/exportar.js";

/* Fixture sintético, con la forma que `catalog()` + `build()` producen. Trae a
   propósito lo que rompe un CSV mal hecho: ñ, acentos, coma, comilla doble y
   un salto de línea dentro de un campo. */
const CATN = { MT: "Media tensión y transformación", CFE: "Suministrador y trámites de red" };
const TAXN = { validado: "Dato validado", fuente: "Estimación con fuente",
  supuesto: "Supuesto", allowance: "Sin base de precio" };
const uab = (u) => ({ pza: "pza", servicio: "serv." }[u] || u);

const ROWS = [
  { c: "MT-001", cat: "MT", d: "Transformador de 1,500 kVA, 23 kV / 480 V",
    u: "pza", q: 1, pu: 1234567.891, imp: 1234567.891, tax: "fuente",
    r: 'Cotización de proveedor, 2026. Incluye "montaje" y pruebas, sin obra civil.',
    tr: "capex" },
  { c: "MT-002", cat: "MT", d: "Celda de seccionamiento con señalización",
    u: "pza", q: 2.5, pu: 98765.4321, imp: 246913.58, tax: "supuesto",
    r: "Referencia interna.\nSegunda línea del sustento, para probar el salto.",
    tr: "capex", eq: 1 },
  { c: "MT-003", cat: "MT", d: "Partida inactiva que no debe exportarse",
    u: "pza", q: 0, pu: 50000, imp: 0, tax: "supuesto", r: "No aplica.",
    tr: "capex" },
  { c: "CFE-004", cat: "CFE", d: "Aportación y presupuesto de obra del suministrador",
    u: "servicio", q: 1, pu: 1125000, imp: 1125000, tax: "allowance",
    r: "Provisión de $750/kVA, extrapolada; pass-through, sin indirectos.",
    tr: "pass" },
  { c: "CFE-005", cat: "CFE", d: "Depósito en garantía ante el suministrador",
    u: "servicio", q: 1, pu: 757944, imp: 757944, tax: "fuente",
    r: "Tarifa GDMTH, apartado 9. Es garantía reembolsable.", tr: "dep" },
];
// Como lo devuelve `totals()`: `on` son los de cantidad mayor que cero.
const T = {
  on: ROWS.filter((r) => r.q > 0),
  capex: ROWS.filter((r) => r.q > 0 && r.tr !== "dep"),
  tec: 2606481.471, fee: 260648.15, cont: 651620.37,
  total: 3518750, dep: 757944, idd: 0.4231,
  cl: { c: 4, nom: "Propuesta preliminar / presupuestal", lo: -22, hi: 35 },
};
const CFG = { nom: "Electrolinera Ecatepec Fase 1", loc: "Ecatepec, Estado de México",
  cont: 25 };

const modelo = () => modeloExport({ rows: ROWS, t: T, cfg: CFG, catn: CATN,
  taxn: TAXN, uab, versionTxt: "v0.12.0 · compilado 04 sept 2026",
  ahora: new Date("2026-09-04T18:30:00Z") });

// --- el modelo --------------------------------------------------------------

test("sólo se exportan los renglones activos", () => {
  const m = modelo();
  assert.equal(m.renglones.length, 4, "el de cantidad cero no entra");
  assert.ok(!m.renglones.some((r) => r.codigo === "MT-003"));
  assert.equal(m.meta.activos, 4);
  assert.equal(m.meta.totalRenglones, 5, "el conteo total sí dice cuántos hay");
});

test("cada renglón conserva código, concepto, unidad, cantidad, PU e importe", () => {
  const r = modelo().renglones[0];
  assert.equal(r.codigo, "MT-001");
  assert.equal(r.concepto, "Transformador de 1,500 kVA, 23 kV / 480 V");
  assert.equal(r.unidad, "pza");
  assert.equal(r.cantidad, 1);
  // El mismo redondeo que la pantalla: dos decimales en PU, al peso el importe.
  assert.equal(r.pu, 1234567.89);
  assert.equal(r.importe, 1234568);
  assert.equal(r.categoria, "Media tensión y transformación");
  assert.equal(r.sustento, "Estimación con fuente");
});

// Sin esta columna, la suma de la columna Importe no cuadra con el subtotal:
// el depósito viaja en la lista y no es costo de obra.
test("el tratamiento de cada renglón viaja con él", () => {
  const m = modelo();
  const de = (c) => m.renglones.find((r) => r.codigo === c).trato;
  assert.equal(de("MT-001"), TRATO.capex);
  assert.equal(de("CFE-004"), TRATO.pass);
  assert.equal(de("CFE-005"), TRATO.dep);
});

test("los totales son los de la app, con sus etiquetas", () => {
  const m = modelo();
  assert.deepEqual(m.totales, [
    { concepto: "Subtotal de obra y equipo", importe: 2606481 },
    { concepto: "Indirectos y administración de proyecto", importe: 260648 },
    { concepto: "Reserva de contingencia (25%)", importe: 651620 },
    { concepto: "Inversión total, más IVA", importe: 3518750 },
  ]);
  // El depósito se reporta APARTE, como en el documento de propuesta.
  assert.equal(m.aparte.length, 1);
  assert.equal(m.aparte[0].importe, 757944);
  assert.match(m.aparte[0].nota, /reembolsable/);
});

// Un modo sin fee ni contingencia (EPC) no debe inventar renglones en cero.
test("sin indirectos ni contingencia esos renglones no aparecen", () => {
  const m = modeloExport({ rows: ROWS, t: { ...T, fee: 0, cont: 0 },
    cfg: { ...CFG, cont: 0 }, catn: CATN, taxn: TAXN, uab });
  assert.deepEqual(m.totales.map((x) => x.concepto),
    ["Subtotal de obra y equipo", "Inversión total, más IVA"]);
});

test("sin renglones no se exporta un archivo vacío: se levanta el error", () => {
  assert.throws(() => modeloExport({ rows: null, t: null }), /nada que exportar/);
});

// --- el CSV -----------------------------------------------------------------

test("el CSV abre en Excel: BOM, CRLF y encabezados", () => {
  const csv = aCSV(modelo());
  assert.equal(csv.charCodeAt(0), 0xFEFF, "sin BOM Excel rompe los acentos");
  assert.ok(csv.includes("\r\n"), "Excel espera CRLF");
  assert.ok(csv.includes(COLUMNAS.join(",")), "los encabezados van completos");
  assert.match(csv, /^﻿Proyecto,Electrolinera Ecatepec Fase 1\r\n/);
});

test("acentos y ñ sobreviven", () => {
  const csv = aCSV(modelo());
  assert.ok(csv.includes("Media tensión y transformación"));
  assert.ok(csv.includes("Ecatepec, Estado de México".replace(/^/, "")));
  assert.ok(csv.includes("señalización"), "la ñ no puede salir mutilada");
});

test("comas, comillas y saltos de línea se escapan como manda el RFC", () => {
  assert.equal(campoCSV("sin nada"), "sin nada");
  assert.equal(campoCSV("con, coma"), '"con, coma"');
  assert.equal(campoCSV('dijo "esto"'), '"dijo ""esto"""');
  assert.equal(campoCSV("dos\nlíneas"), '"dos\nlíneas"');
  const csv = aCSV(modelo());
  // El concepto trae una coma: tiene que venir entrecomillado, no partido.
  assert.ok(csv.includes('"Transformador de 1,500 kVA, 23 kV / 480 V"'));
  // El sustento trae comillas dobles: duplicadas dentro del campo.
  assert.ok(csv.includes('Incluye ""montaje"" y pruebas'));
  // Y un salto de línea dentro del campo, entrecomillado.
  assert.ok(csv.includes('"Referencia interna.\nSegunda línea'));
});

/* Un lector de CSV mínimo, con las reglas del RFC 4180. Está aquí para que la
   prueba lea el archivo COMO LO LEE EXCEL —campo por campo, respetando las
   comillas— en vez de buscar subcadenas: buscar texto suelto daba verde a un
   archivo cuyas columnas estuvieran corridas, y encontraba el `$` de la prosa
   del sustento creyendo que era un importe con formato. */
function leerCSV(texto) {
  const t = texto.replace(/^﻿/, "");
  const filas = []; let campo = ""; let fila = []; let dentro = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentro) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') dentro = false;
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\r" && t[i + 1] === "\n") {
      fila.push(campo); filas.push(fila); fila = []; campo = ""; i++;
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Si el número llevara `$` o separador de miles, Excel lo trataría como texto y
// no se podría sumar. Es el defecto que más molesta al usar el archivo.
test("las columnas numéricas son números que Excel puede sumar", () => {
  const filas = leerCSV(aCSV(modelo()));
  const iEnc = filas.findIndex((f) => f[0] === "Código");
  assert.ok(iEnc > 0, "el archivo tiene su renglón de encabezados");
  assert.deepEqual(filas[iEnc], COLUMNAS);
  const iCant = COLUMNAS.indexOf("Cantidad");
  const iPU = COLUMNAS.indexOf("Precio unitario");
  const iImp = COLUMNAS.indexOf("Importe");
  /* Los renglones son los que van del encabezado a la primera línea en blanco.
     Cortar ahí importa: después de esa línea vienen los totales y el depósito,
     que llevan el mismo número de columnas y no son partidas. */
  const resto = filas.slice(iEnc + 1);
  const fin = resto.findIndex((f) => f.every((v) => v === ""));
  const datos = (fin === -1 ? resto : resto.slice(0, fin));
  assert.equal(datos.length, 4, "cuatro renglones activos, ni uno más");
  for (const f of datos) {
    for (const [col, i] of [["cantidad", iCant], ["PU", iPU], ["importe", iImp]]) {
      assert.match(f[i], /^-?\d+(\.\d+)?$/,
        `${f[0]}: la ${col} salió como "${f[i]}", que Excel lee como texto`);
    }
  }
  // El campo llega íntegro aunque traiga comas: es la prueba de que las
  // columnas no se corrieron.
  const mt1 = datos.find((f) => f[0] === "MT-001");
  assert.equal(mt1[COLUMNAS.indexOf("Concepto")],
    "Transformador de 1,500 kVA, 23 kV / 480 V");
  assert.equal(mt1[iCant], "1");
  assert.equal(mt1[iPU], "1234567.89");
  assert.equal(mt1[iImp], "1234568");
  // Y el salto de línea dentro de un campo no parte el renglón en dos.
  const mt2 = datos.find((f) => f[0] === "MT-002");
  assert.match(mt2[COLUMNAS.indexOf("Base del número")], /\nSegunda línea/);
});

test("el nombre del archivo es estable y sin acentos", () => {
  assert.equal(nombreArchivo("Electrolinera Ecatepec Fase 1",
    new Date("2026-09-04T12:00:00"), "csv"),
  "catalogo-electrolinera-ecatepec-fase-1-2026-09-04.csv");
  assert.equal(slug("Estación Móvil — Querétaro"), "estacion-movil-queretaro");
  assert.equal(slug(""), "catalogo");
  assert.equal(nombreArchivo(null, new Date("2026-01-02T00:00:00"), "csv"),
    "catalogo-catalogo-2026-01-02.csv");
});

// --- el documento imprimible ------------------------------------------------

test("el documento no lleva ni un control interactivo", () => {
  const html = documentoHTML(modelo(), { fuentes: "", logo: "" });
  for (const etiqueta of ["<input", "<select", "<button", "<textarea",
    "<form", "onclick", "contenteditable"]) {
    assert.ok(!html.toLowerCase().includes(etiqueta),
      `el documento imprimible no puede traer ${etiqueta}`);
  }
});

test("el documento pagina: encabezado repetido y renglones sin cortar", () => {
  const html = documentoHTML(modelo(), { fuentes: "", logo: "" });
  assert.ok(html.includes("@page{size:letter"), "tamaño de página declarado");
  assert.ok(html.includes("thead{display:table-header-group}"),
    "sin esto, en la página 2 la tabla no tiene encabezado");
  assert.ok(html.includes("break-inside:avoid"),
    "sin esto un renglón se corta a la mitad entre dos páginas");
});

test("el documento trae proyecto, ubicación, fecha, versión y totales", () => {
  const html = documentoHTML(modelo(), { fuentes: "", logo: "data:image/png;base64,AAA" });
  assert.ok(html.includes("Electrolinera Ecatepec Fase 1"));
  assert.ok(html.includes("Ecatepec, Estado de México"));
  assert.ok(html.includes("v0.12.0 · compilado 04 sept 2026"));
  assert.ok(html.includes("Clase 4 — Propuesta preliminar / presupuestal"));
  assert.ok(html.includes("Inversión total, más IVA"));
  assert.ok(html.includes("$3,518,750"));
  assert.ok(html.includes("BEYOND AE"), "branding discreto, pero presente");
  assert.ok(html.includes('<img src="data:image/png;base64,AAA"'));
});

test("el documento sólo lista los renglones activos", () => {
  const html = documentoHTML(modelo(), {});
  assert.ok(html.includes("MT-001"));
  assert.ok(!html.includes("MT-003"), "el inactivo no entra al documento");
});

// El nombre del proyecto lo escribe el usuario: si no se escapa, un `<` rompe
// el documento entero.
test("el marcado se escapa: un nombre con < no rompe el documento", () => {
  const html = documentoHTML(modeloExport({ rows: ROWS, t: T,
    cfg: { ...CFG, nom: 'Predio <script>alert("x")</script>' },
    catn: CATN, taxn: TAXN, uab }), {});
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
