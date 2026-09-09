/* Los frentes CAPEX / OPEX en un navegador de verdad (issue #7).
   ==============================================================

   POR QUÉ ESTAS PRUEBAS NO PUEDEN VIVIR EN `npm test`
   ---------------------------------------------------
   Lo que se comprueba aquí no es aritmética —eso está en
   `pruebas/finanzas.test.mjs`, sin navegador— sino lo que sólo existe cuando
   hay pantalla:

   1. Que el CAPEX que muestra OPEX sea EL MISMO que el del presupuesto y el
      del archivo exportado. Es la condición central del issue: el CAPEX no se
      recalcula ni se captura, se hereda.
   2. Que la reorganización en dos frentes no rompiera nada de CAPEX.
   3. Que abrir un proyecto anterior no le escriba nada, y que la plantilla de
      OPEX y el modo demostración tampoco lo hagan solos.
   4. Que la vista de inversionista sea de sólo lectura EN EL DOM y no traiga
      datos internos.

   EL FIXTURE ES LA PLANTILLA DE ATLACOMULCO, NO UN PROYECTO REAL
   --------------------------------------------------------------
   Sin variables de entorno la aplicación corre contra el navegador, sin nube y
   sin sesión. Ninguna de estas pruebas toca base de datos alguna.
*/

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

const aqui = dirname(fileURLToPath(import.meta.url));
const DIST = join(aqui, "..", "dist");
const TIPOS = { ".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".mjs": "text/javascript" };

let servidor; let navegador; let base; let sinNavegador = false;

before(async () => {
  assert.ok(existsSync(DIST), "corre npm run build antes de esta prueba");
  servidor = createServer(async (req, res) => {
    const ruta = req.url.split("?")[0];
    const archivo = join(DIST, ruta === "/" ? "index.html" : ruta);
    try {
      const datos = await readFile(archivo);
      res.writeHead(200, { "content-type":
        TIPOS[extname(archivo)] ?? "application/octet-stream" });
      res.end(datos);
    } catch { res.writeHead(404).end("no"); }
  });
  await new Promise((r) => servidor.listen(0, r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  const preinstalado = "/opt/pw-browsers/chromium";
  try {
    navegador = await chromium.launch(existsSync(preinstalado)
      ? { executablePath: preinstalado } : {});
  } catch (err) { sinNavegador = err.message; }
});

after(async () => {
  await navegador?.close();
  await new Promise((r) => servidor.close(r));
});

const num = (s) => Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));

async function conProyectoAbierto() {
  const pagina = await navegador.newPage({ acceptDownloads: true });
  await pagina.goto(base, { waitUntil: "domcontentloaded" });
  await pagina.locator('[data-acc="plantilla"], [data-acc="abrir"]').first()
    .click({ timeout: 20000 });
  await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
  return pagina;
}

const irAOpex = async (pagina, panel = "res") => {
  await pagina.locator('[data-ws="opex"]').click();
  await pagina.locator(`#finNav [data-fin="${panel}"]`).click();
  await pagina.locator(`#fin-${panel}`).waitFor({ timeout: 20000 });
};

/* Enciende el modo demostración, que es la única forma de tener cifras sin
   capturarlas a mano. Vive en memoria de la pantalla: no toca el proyecto. */
const conDemo = async (pagina) => {
  await irAOpex(pagina, "ctrl");
  await pagina.locator("#fin_demo_on").click();
  await pagina.locator("#fin_demo").waitFor({ timeout: 20000 });
};

async function exportarCSV(pagina) {
  const esperada = pagina.waitForEvent("download", { timeout: 20000 });
  await pagina.locator('[data-ws="capex"]').click();
  await pagina.locator('.tab[data-t="boq"]').click();
  await pagina.locator("#x_menu > summary").click();
  await pagina.locator("#x_csv").click();
  const descarga = await esperada;
  return await readFile(await descarga.path(), "utf8");
}

/* --- LOS DOS FRENTES ------------------------------------------------------ */

test("el proyecto se divide en dos frentes y cada uno enseña lo suyo", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  // Arranca en CAPEX.
  assert.equal(await pagina.locator("#tabsCapex").isVisible(), true);
  assert.equal(await pagina.locator("#p-fin").isVisible(), false);
  assert.equal(await pagina.locator('[data-ws="capex"]').getAttribute("aria-selected"), "true");

  await pagina.locator('[data-ws="opex"]').click();
  assert.equal(await pagina.locator("#p-fin").isVisible(), true);
  assert.equal(await pagina.locator("#tabsCapex").isVisible(), false,
    "en OPEX no se enseñan las pestañas técnicas");
  for (const t2 of ["conf", "alc", "res", "dist", "prec", "boq", "gen", "exp"]) {
    assert.equal(await pagina.locator("#p-" + t2).isVisible(), false,
      `la sección ${t2} tiene que quedar oculta en OPEX`);
  }
  await pagina.locator('[data-ws="capex"]').click();
  assert.equal(await pagina.locator("#tabsCapex").isVisible(), true);
  assert.equal(await pagina.locator("#p-fin").isVisible(), false);
  await pagina.close();
});

test("el frente CAPEX sigue navegable pestaña por pestaña", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  for (const clave of ["conf", "alc", "res", "dist", "prec", "boq", "gen", "exp"]) {
    await pagina.locator(`.tab[data-t="${clave}"]`).click();
    assert.equal(await pagina.locator("#p-" + clave).isVisible(), true,
      `la pestaña ${clave} dejó de abrir`);
  }
  await pagina.close();
});

test("el frente OPEX es navegable en sus seis pantallas", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await pagina.locator('[data-ws="opex"]').click();
  for (const p of ["res", "ctrl", "opex", "proy", "inv", "vista"]) {
    await pagina.locator(`#finNav [data-fin="${p}"]`).click();
    assert.equal(await pagina.locator("#fin-" + p).isVisible(), true,
      `la pantalla ${p} no abre`);
  }
  await pagina.close();
});

test("la tarifa, la generación y los escenarios se capturan en OPEX", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  /* Se MUDÓ dónde se capturan, no se duplicaron: los mismos campos, con los
     mismos identificadores y las mismas llaves de `cfg`, ahora viven en el
     frente de operación. Si alguien creara una copia, estos conteos darían 2. */
  const pagina = await conProyectoAbierto();
  await irAOpex(pagina, "ctrl");
  for (const id of ["v_tarifaCat", "v_cargoCap", "v_enPunta", "v_kwp", "v_bess",
    "v_esc1Ses", "v_esc2Ses", "v_esc3Ses", "v_pctPunta"]) {
    assert.equal(await pagina.locator(`#fin-ctrl #${id}`).count(), 1,
      `${id} tiene que vivir en Control general`);
    assert.equal(await pagina.locator(`#${id}`).count(), 1,
      `${id} aparece más de una vez: se duplicó en vez de mudarse`);
  }
  // Y el balanceo y el transformador se quedaron en CAPEX, que es su sitio.
  assert.equal(await pagina.locator("#p-conf #v_balanceo").count(), 1);
  assert.equal(await pagina.locator("#p-conf #v_kva").count(), 1);
  await pagina.close();
});

/* --- EL CAPEX NO CAMBIÓ CON LA REORGANIZACIÓN ----------------------------- */

test("el CAPEX de OPEX es el del presupuesto y el del archivo exportado", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await irAOpex(pagina);

  const capex = num(await pagina.locator("#fin_capex").textContent());
  assert.equal(capex, 48670755,
    "el caso de referencia tiene que seguir dando la misma inversión total "
    + "después de mover pantallas de sitio");

  const desglose = await pagina.locator("#fin_capex_desglose .derived")
    .evaluateAll((els) => els.map((e) => ({
      rotulo: e.querySelector("span").textContent,
      valor: e.querySelector("b").textContent,
    })));
  const total = desglose.find((x) => x.rotulo.includes("Inversión total"));
  assert.ok(total);
  assert.equal(num(total.valor), capex);

  const csv = await exportarCSV(pagina);
  const enCSV = csv.split(/\r?\n/)
    .find((l) => l.startsWith('"Inversión total, más IVA"')
      || l.startsWith("Inversión total, más IVA"));
  assert.ok(enCSV, "el CSV tiene que traer el renglón de inversión total");
  assert.equal(num(enCSV.split(",").pop()), capex);

  await irAOpex(pagina, "inv");
  assert.equal(num(await pagina.locator("#fin_inv_req").textContent()), capex);
  await pagina.close();
});

test("no hay ningún campo donde capturar el CAPEX", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await irAOpex(pagina);
  const editables = await pagina.locator("#fin-res input, #fin-res select").count();
  assert.equal(editables, 0,
    "el Resumen de OPEX no puede tener campos: sus cifras son derivadas");
  await pagina.close();
});

/* --- OPEX: PLANTILLA, ESCALAMIENTO Y VARIABLES ---------------------------- */

test("la plantilla de OPEX trae los conceptos del modelo y ningún monto", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await irAOpex(pagina, "opex");
  assert.equal(await pagina.locator("#fin_opex_body tr").count(), 0,
    "un proyecto sin finanzas arranca con la tabla vacía");

  await pagina.locator("#fin_plantilla").click();
  await pagina.locator("#fin_opex_body tr").first().waitFor({ timeout: 20000 });
  assert.equal(await pagina.locator("#fin_opex_body tr").count(), 13);
  const nombres = await pagina.locator('#fin_opex_body input[data-campo="concepto"]')
    .evaluateAll((els) => els.map((e) => e.value));
  assert.ok(nombres.includes("Sueldo Encargado(s)"));
  assert.ok(nombres.includes("Guardias Seguridad"));
  assert.ok(nombres.includes("Seguros y Fianzas"));
  const montos = await pagina.locator('#fin_opex_body input[data-campo="monto"]')
    .evaluateAll((els) => els.map((e) => Number(e.value)));
  assert.ok(montos.every((m) => m === 0), "la plantilla no trae montos");
  assert.equal(num(await pagina.locator("#fin_opex_tot_mes").textContent()), 0);
  await pagina.close();
});

test("el IPC se hereda, la tasa propia lo sobreescribe y sin incremento no crece",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoAbierto();
    await irAOpex(pagina, "ctrl");
    await pagina.locator("#f_ipc").fill("7");
    await irAOpex(pagina, "opex");
    await pagina.locator("#fin_add_opex").click();
    await pagina.locator("#fin_opex_body tr").first().waitFor();
    await pagina.locator('#fin_opex_body input[data-campo="monto"]').first().fill("1000");
    await pagina.waitForTimeout(150);

    const tasa = () => pagina.locator("#fin_opex_body [data-tasaTxt]").first().textContent();
    assert.equal((await tasa()).trim(), "7.00%", "hereda el IPC del proyecto");
    assert.equal(num(await pagina.locator("#fin_opex_ipc").textContent()), 7);

    await pagina.locator("#fin_opex_body [data-inc]").first().selectOption("propia");
    await pagina.waitForTimeout(150);
    await pagina.locator("#fin_opex_body [data-tasa]").first().fill("12");
    await pagina.waitForTimeout(150);
    assert.equal(await pagina.locator("#fin_opex_body [data-tasa]").first().inputValue(), "12");

    await pagina.locator("#fin_opex_body [data-inc]").first().selectOption("ninguno");
    await pagina.waitForTimeout(150);
    assert.equal((await tasa()).trim(), "0.00%", "sin incremento la tasa efectiva es cero");
    await pagina.close();
  });

test("los costos variables se capturan aparte del OPEX fijo", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await irAOpex(pagina, "opex");
  await pagina.locator("#fin_add_var").click();
  await pagina.locator("#fin_var_body tr").first().waitFor();
  await pagina.locator('#fin_var_body input[data-campo="concepto"]').first()
    .fill("Comisiones Concesionaria");
  await pagina.locator('#fin_var_body input[data-campo="pct"]').first().fill("15");
  await pagina.waitForTimeout(200);
  assert.equal((await pagina.locator("#fin_var_tot").textContent()).trim(), "15.00%");
  assert.equal(num(await pagina.locator("#fin_opex_tot_mes").textContent()), 0,
    "un porcentaje sobre ventas no puede sumarse al OPEX fijo mensual");
  await pagina.close();
});

/* --- PROYECCIÓN ----------------------------------------------------------- */

test("la proyección trae doce meses por año más la columna del año", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "proy");
  const cols = await pagina.locator("#fin_proy_tabla thead th").count();
  assert.equal(cols, 14, "concepto + doce meses + año");
  const anios = await pagina.locator("#f_proy_anio option").count();
  assert.equal(anios, 10, "el horizonte del modelo de referencia son diez años");
  assert.ok(await pagina.locator("#fin_proy_tabla tbody tr").count() >= 20);
  await pagina.close();
});

test("las ventas del mes son los kWh vendidos por el precio", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "proy");
  const fila = async (titulo) => (await pagina
    .locator(`#fin_proy_tabla tbody tr:has(th:text-is("${titulo}")) td`)
    .allTextContents()).map(num);
  const kwh = await fila("kWh vendidos en el mes");
  const precio = await fila("Precio de venta ($/kWh)");
  const ventas = await fila("Ventas");
  for (let i = 0; i < 12; i++) {
    assert.ok(Math.abs(ventas[i] - kwh[i] * precio[i]) <= Math.max(2, kwh[i] * 0.01),
      `mes ${i + 1}: ${ventas[i]} no es ${kwh[i]} × ${precio[i]}`);
  }
  // EBITDA = utilidad bruta - variables - OPEX fijo, en la propia pantalla.
  const ub = await fila("Utilidad bruta");
  const cv = await fila("Costos variables sobre ventas");
  const of = await fila("OPEX fijo");
  const eb = await fila("EBITDA");
  for (let i = 0; i < 12; i++) {
    assert.ok(Math.abs(eb[i] - (ub[i] - cv[i] - of[i])) <= 2, `mes ${i + 1}`);
  }
  await pagina.close();
});

test("cambiar de escenario cambia la proyección", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "ctrl");
  // Se capturan dos escenarios distintos en la tabla que ahora vive aquí.
  await pagina.locator("#v_esc1Ses").fill("10");
  await pagina.locator("#v_esc1Kwh").fill("40");
  await pagina.locator("#v_esc3Ses").fill("30");
  await pagina.locator("#v_esc3Kwh").fill("40");
  await pagina.waitForTimeout(200);
  const ventasAnual = async () => {
    await irAOpex(pagina, "proy");
    const celdas = await pagina
      .locator('#fin_proy_tabla tbody tr:has(th:text-is("Ventas")) td').allTextContents();
    return num(celdas[celdas.length - 1]);
  };
  await irAOpex(pagina, "ctrl");
  await pagina.locator("#f_escenario").selectOption("1");
  const pesimista = await ventasAnual();
  await irAOpex(pagina, "ctrl");
  await pagina.locator("#f_escenario").selectOption("3");
  const optimista = await ventasAnual();
  /* No es el triple exacto aunque el escenario triplique las sesiones: el año
     uno arranca en la rampa, y los dos escenarios parten del mismo número de
     sesiones inicial. Lo que la prueba fija es que el escenario MANDA sobre la
     proyección, no una proporción que dependería de la rampa. */
  assert.ok(optimista > pesimista * 2,
    `el optimista (${optimista}) tiene que vender bastante más que el pesimista (${pesimista})`);
  await pagina.close();
});

test("el cambio de suministrador se ve desde el mes configurado", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "proy");
  const sumin = async () => (await pagina
    .locator('#fin_proy_tabla tbody tr:has(th:text-is("Suministrador")) td')
    .allTextContents()).map((s) => s.trim());
  // El modelo de referencia arranca en CFE en 2027 y cambia a MEM en 2028.
  assert.deepEqual(new Set(await sumin()), new Set(["CFE"]));
  await pagina.locator("#f_proy_anio").selectOption("2028");
  await pagina.waitForTimeout(200);
  assert.ok((await sumin()).includes("MEM"),
    "a partir del mes de cambio la proyección tiene que decir MEM");
  await pagina.close();
});

/* --- VISTA DE INVERSIONISTA ----------------------------------------------- */

test("la vista de inversionista no tiene un solo control en el DOM", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "vista");
  await pagina.locator("#fin-hoja").waitFor({ timeout: 20000 });
  const controles = await pagina.locator(
    "#fin-vista input, #fin-vista select, #fin-vista textarea, "
    + "#fin-vista button, #fin-vista [contenteditable]").count();
  assert.equal(controles, 0, "la vista de inversionista es de sólo lectura");
  await pagina.close();
});

test("la vista de inversionista no enseña datos internos del proyecto", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "vista");
  const hoja = await pagina.locator("#fin-hoja").innerHTML();
  for (const rastro of ["MT-015", "CFE-005", "EVSE-", "Centro Sur",
    "Provisión de", "kVA", "Base del número", "allowance", "Demanda facturable",
    "Sesiones por día"]) {
    assert.ok(!hoja.includes(rastro),
      `la vista de inversionista está enseñando «${rastro}»`);
  }
  for (const dato of ["Atlacomulco", "Inversionista A", "Participación",
    "Estimado paramétrico", "Proyección de operación", "EBITDA"]) {
    assert.ok(hoja.includes(dato), `falta «${dato}» en la hoja`);
  }
  await pagina.close();
});

test("la hoja avisa cuando las cifras son de demostración", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await conDemo(pagina);
  await irAOpex(pagina, "vista");
  assert.ok((await pagina.locator("#fin-hoja").innerText())
    .includes("Datos de demostración"),
  "el aviso tiene que ir dentro de la hoja, que es lo que alguien enseñaría");
  await pagina.close();
});

/* --- NADA SE ESCRIBE SOLO ------------------------------------------------- */

const ID_HEREDADO = "proyecto-heredado-sin-finanzas";
const PROYECTO_HEREDADO = {
  id: ID_HEREDADO, clave: ID_HEREDADO,
  nombre: "Estación heredada — sin finanzas",
  ubicacion: "Toluca, Estado de México",
  archivado: false,
  creado_en: "2026-03-01T00:00:00.000Z",
  actualizado_en: "2026-03-01T00:00:00.000Z",
  estado: {
    v: 1,
    cfg: {
      nom: "Estación heredada — sin finanzas", loc: "Toluca, Estado de México",
      modo: "propia", kva: "1000", grupos: [{ kw: 120, q: 2, con: 2 }],
    },
    edits: {}, genEdits: {}, genApproved: {},
  },
};

async function conProyectoHeredado() {
  const pagina = await navegador.newPage({ acceptDownloads: true });
  await pagina.addInitScript(([clave, valor]) => {
    localStorage.setItem(clave, valor);
  }, ["beyond:proyectos", JSON.stringify([PROYECTO_HEREDADO])]);
  await pagina.goto(base, { waitUntil: "domcontentloaded" });
  await pagina.locator(`[data-abrir="${ID_HEREDADO}"]`).click({ timeout: 20000 });
  await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
  return pagina;
}

const proyectoGuardado = (pagina) => pagina.evaluate(() =>
  JSON.parse(localStorage.getItem("beyond:proyectos") || "[]")[0]);

const huella = (pagina) => pagina.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i); o[k] = localStorage.getItem(k);
  }
  return JSON.stringify(o);
});

test("un proyecto guardado sin finanzas abre y la sección se pinta en cero",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoHeredado();
    await irAOpex(pagina);
    assert.ok(num(await pagina.locator("#fin_capex").textContent()) > 0,
      "el CAPEX viene del presupuesto, que sí existe");
    assert.equal(num(await pagina.locator("#fin_opex_mes").textContent()), 0);
    assert.equal(await pagina.locator("#fin_ninv").textContent(), "0");
    await irAOpex(pagina, "opex");
    assert.equal(await pagina.locator("#fin_opex_body tr").count(), 0);
    await irAOpex(pagina, "ctrl");
    assert.equal(await pagina.locator("#f_ipc").inputValue(), "0",
      "ningún supuesto llega precargado con una cifra plausible");
    await pagina.close();
  });

test("recorrer las seis pantallas de OPEX no le escribe nada al proyecto",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoHeredado();
    await pagina.waitForTimeout(1200);
    const antes = await huella(pagina);
    for (const panel of ["res", "ctrl", "opex", "proy", "inv", "vista"]) {
      await irAOpex(pagina, panel);
      await pagina.waitForTimeout(150);
    }
    await pagina.waitForTimeout(1500);
    assert.equal(await huella(pagina), antes,
      "mirar no puede marcar el proyecto como sucio ni guardarlo");
    const p = await proyectoGuardado(pagina);
    assert.equal("finanzas" in p.estado, false);
    assert.equal(p.actualizado_en, PROYECTO_HEREDADO.actualizado_en,
      "la marca de tiempo del proyecto no se movió");
    await pagina.close();
  });

test("el modo demostración no toca el proyecto, y convertirlo pide confirmación",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoHeredado();
    await pagina.waitForTimeout(1200);
    const antes = await huella(pagina);

    await conDemo(pagina);
    await irAOpex(pagina, "opex");
    assert.ok(await pagina.locator("#fin_opex_body tr").count() >= 13,
      "el modo demostración tiene que llenar la pantalla");
    await pagina.waitForTimeout(1500);
    assert.equal(await huella(pagina), antes,
      "las cifras de demostración no pueden acabar guardadas en el proyecto");

    // Cancelar la conversión tampoco escribe.
    pagina.once("dialog", (d) => d.dismiss());
    await pagina.locator("#fin_demo_guardar").click();
    await pagina.waitForTimeout(1500);
    assert.equal(await huella(pagina), antes, "cancelar no escribe");

    // Aceptar sí, y sólo entonces.
    pagina.once("dialog", (d) => d.accept());
    await pagina.locator("#fin_demo_guardar").click();
    await pagina.waitForTimeout(1800);
    const p = await proyectoGuardado(pagina);
    assert.ok(p.estado.finanzas, "al confirmar, los datos pasan al proyecto");
    assert.equal(p.estado.finanzas.v, 2);
    assert.equal(p.estado.finanzas.demo, true,
      "y siguen marcados como inventados");
    assert.equal(p.estado.cfg.nom, "Estación heredada — sin finanzas",
      "el resto del estado del proyecto no se toca");
    await pagina.close();
  });

test("la plantilla de OPEX sólo escribe cuando el usuario la pide", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoHeredado();
  await pagina.waitForTimeout(1200);
  const antes = await huella(pagina);
  await irAOpex(pagina, "opex");
  await pagina.waitForTimeout(1200);
  assert.equal(await huella(pagina), antes, "abrir la pantalla no escribe");

  await pagina.locator("#fin_plantilla").click();
  await pagina.waitForTimeout(1800);
  const p = await proyectoGuardado(pagina);
  assert.equal(p.estado.finanzas.opex.length, 13);
  assert.equal(p.estado.finanzas.v, 2, "con su propia versión");
  assert.ok(p.estado.finanzas.opex.every((r) => r.monto === 0),
    "y sin un solo monto inventado");
  await pagina.close();
});
