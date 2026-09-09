/* La sección Finanzas en un navegador de verdad (issue #7).
   =========================================================

   POR QUÉ ESTAS PRUEBAS NO PUEDEN VIVIR EN `npm test`
   ---------------------------------------------------
   Lo que se comprueba aquí no es aritmética —eso está en
   `pruebas/finanzas.test.mjs`, sin navegador— sino tres cosas que sólo existen
   cuando hay pantalla:

   1. Que el CAPEX que muestra Finanzas sea EL MISMO que el del presupuesto y
      el del archivo exportado. Es la condición central del issue: el CAPEX no
      se recalcula ni se captura, se hereda. Un módulo financiero que
      reconstruyera la cifra por su cuenta acabaría, algún día, enseñándole a
      un inversionista un número distinto al de la propuesta.
   2. Que abrir un proyecto anterior —sin `estado.finanzas`— no le escriba
      nada. Se compara la huella completa del almacenamiento antes y después
      de recorrer las cuatro pantallas.
   3. Que la vista de inversionista sea de sólo lectura EN EL DOM y no traiga
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

const irAFinanzas = async (pagina, panel = "res") => {
  await pagina.locator('.tab[data-t="fin"]').click();
  await pagina.locator(`#finNav [data-fin="${panel}"]`).click();
  await pagina.locator(`#fin-${panel}`).waitFor({ timeout: 20000 });
};

/* Carga los datos de demostración desde la pantalla, que es la única forma de
   que existan: un proyecto nuevo arranca con Finanzas vacías. */
const cargarDemo = async (pagina) => {
  await irAFinanzas(pagina, "opex");
  await pagina.locator("[data-fin-demo]").first().click();
  await pagina.locator("#fin_opex_body tr").first().waitFor({ timeout: 20000 });
};

async function exportarCSV(pagina) {
  const esperada = pagina.waitForEvent("download", { timeout: 20000 });
  await pagina.locator('.tab[data-t="boq"]').click();
  await pagina.locator("#x_menu > summary").click();
  await pagina.locator("#x_csv").click();
  const descarga = await esperada;
  return await readFile(await descarga.path(), "utf8");
}

/* --- EL CAPEX ES EL MISMO EN TODAS PARTES -------------------------------- */

test("el CAPEX de Finanzas es el mismo del presupuesto y del archivo exportado",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoAbierto();
    await irAFinanzas(pagina);

    const capexFinanzas = num(await pagina.locator("#fin_capex").textContent());
    assert.ok(capexFinanzas > 0, "la plantilla tiene que producir un CAPEX");

    // 1. Contra el desglose de la propia sección, que sale de `totals()`.
    const desglose = await pagina.locator("#fin_capex_desglose .derived")
      .evaluateAll((els) => els.map((e) => ({
        rotulo: e.querySelector("span").textContent,
        valor: e.querySelector("b").textContent,
      })));
    const renglonTotal = desglose.find((x) => x.rotulo.includes("Inversión total"));
    assert.ok(renglonTotal, "el desglose tiene que declarar la inversión total");
    assert.equal(num(renglonTotal.valor), capexFinanzas);

    // 2. Contra el archivo que se le manda al cliente, que es la otra salida
    //    que consume el mismo resultado.
    const csv = await exportarCSV(pagina);
    const enCSV = csv.split(/\r?\n/)
      .find((l) => l.startsWith('"Inversión total, más IVA"')
        || l.startsWith("Inversión total, más IVA"));
    assert.ok(enCSV, "el CSV tiene que traer el renglón de inversión total");
    assert.equal(num(enCSV.split(",").pop()), capexFinanzas,
      "el CAPEX de Finanzas y el del archivo exportado tienen que ser el mismo número");

    // 3. Y la pantalla de Inversionistas usa exactamente esa cifra.
    await irAFinanzas(pagina, "inv");
    assert.equal(num(await pagina.locator("#fin_inv_req").textContent()),
      capexFinanzas);
    await pagina.close();
  });

test("no hay ningún campo donde capturar el CAPEX", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await irAFinanzas(pagina);
  /* El CAPEX se hereda del presupuesto. Si algún día apareciera un campo para
     escribirlo, habría dos cifras de inversión y esta prueba tiene que caer. */
  const editables = await pagina.locator("#fin-res input, #fin-res select").count();
  assert.equal(editables, 0,
    "el Resumen de Finanzas no puede tener campos: sus cifras son derivadas");
  await pagina.close();
});

/* --- OPEX ----------------------------------------------------------------- */

test("el OPEX de la pantalla cuadra renglón por renglón", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await cargarDemo(pagina);

  const montos = await pagina.locator('#fin_opex_body input[data-campo="monto"]')
    .evaluateAll((els) => els.map((e) => Number(e.value)));
  const esperadoMes = montos.reduce((a, b) => a + b, 0);
  assert.ok(montos.length >= 8, "los datos de demostración traen conceptos");

  assert.equal(num(await pagina.locator("#fin_opex_tot_mes").textContent()),
    esperadoMes);
  assert.equal(num(await pagina.locator("#fin_opex_tot_anio").textContent()),
    esperadoMes * 12);

  // Y el Resumen dice lo mismo que la pestaña de captura.
  await irAFinanzas(pagina, "res");
  assert.equal(num(await pagina.locator("#fin_opex_mes").textContent()), esperadoMes);
  assert.equal(num(await pagina.locator("#fin_opex_anio").textContent()), esperadoMes * 12);
  await pagina.close();
});

test("desactivar un concepto lo saca del total sin borrarlo", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await cargarDemo(pagina);
  const antes = num(await pagina.locator("#fin_opex_tot_mes").textContent());
  const filas = await pagina.locator("#fin_opex_body tr").count();
  const primero = num(await pagina.locator('#fin_opex_body input[data-campo="monto"]')
    .first().inputValue());

  await pagina.locator('#fin_opex_body input[data-campo="activo"]').first().uncheck();
  await pagina.waitForTimeout(150);

  assert.equal(num(await pagina.locator("#fin_opex_tot_mes").textContent()),
    antes - primero, "el concepto desactivado deja de sumar");
  assert.equal(await pagina.locator("#fin_opex_body tr").count(), filas,
    "y sigue en la lista");
  await pagina.close();
});

test("escribir un monto no le quita el foco al campo", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  /* `render()` corre en cada tecla. Si la tabla se reconstruyera, el cursor se
     perdería a media captura y la pantalla sería inusable. */
  const pagina = await conProyectoAbierto();
  await irAFinanzas(pagina, "opex");
  await pagina.locator("#fin_add_opex").click();
  const campo = pagina.locator('#fin_opex_body input[data-campo="concepto"]').first();
  await campo.click();
  await campo.type("Vigilancia nocturna");
  assert.equal(await campo.inputValue(), "Vigilancia nocturna");
  assert.equal(await pagina.evaluate(() => document.activeElement?.dataset?.campo),
    "concepto", "el foco tiene que seguir en el campo que se está escribiendo");
  await pagina.close();
});

/* --- INVERSIONISTAS ------------------------------------------------------- */

test("las participaciones y la brecha de fondeo cuadran en pantalla", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await cargarDemo(pagina);
  await irAFinanzas(pagina, "inv");

  const aportaciones = await pagina
    .locator('#fin_inv_body input[data-campo="aportacion"]')
    .evaluateAll((els) => els.map((e) => Number(e.value)));
  const partes = await pagina.locator("#fin_inv_body [data-part]")
    .evaluateAll((els) => els.map((e) => Number(e.textContent.replace("%", ""))));
  const aportado = aportaciones.reduce((a, b) => a + b, 0);

  assert.equal(num(await pagina.locator("#fin_inv_apo").textContent()), aportado);
  for (const [i, a] of aportaciones.entries()) {
    assert.ok(Math.abs(partes[i] - (a / aportado) * 100) < 0.01,
      `la participación del renglón ${i} no corresponde a su aportación`);
  }
  assert.equal(await pagina.locator("#fin_inv_suma").textContent(), "100.00%");

  const capex = num(await pagina.locator("#fin_inv_req").textContent());
  assert.equal(num(await pagina.locator("#fin_inv_gap").textContent()),
    capex - aportado, "el faltante es el CAPEX menos lo aportado");
  await pagina.close();
});

/* --- VISTA DE INVERSIONISTA ----------------------------------------------- */

test("la vista de inversionista no tiene un solo control en el DOM", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await cargarDemo(pagina);
  await irAFinanzas(pagina, "vista");
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
  await cargarDemo(pagina);
  await irAFinanzas(pagina, "vista");
  const hoja = await pagina.locator("#fin-hoja").innerHTML();

  /* Códigos de concepto, precios unitarios, la base de cada número y los
     parámetros de tarifa son internos. La hoja se arma del snapshot, así que
     no puede traerlos aunque el proyecto los tenga cargados. */
  for (const rastro of ["MT-015", "CFE-005", "EVSE-", "Centro Sur",
    "Provisión de", "kVA", "Base del número", "allowance"]) {
    assert.ok(!hoja.includes(rastro),
      `la vista de inversionista está enseñando «${rastro}»`);
  }
  // Y sí trae lo que le toca.
  for (const dato of ["Atlacomulco", "Inversionista A", "Participación",
    "Estimado paramétrico"]) {
    assert.ok(hoja.includes(dato), `falta «${dato}» en la hoja`);
  }
  await pagina.close();
});

test("la hoja avisa cuando las cifras son de demostración", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  await cargarDemo(pagina);
  await irAFinanzas(pagina, "vista");
  assert.ok((await pagina.locator("#fin-hoja").innerText())
    .includes("Datos de demostración"),
  "el aviso tiene que ir dentro de la hoja, que es lo que alguien enseñaría");
  await pagina.close();
});

/* --- COMPATIBILIDAD: UN PROYECTO ANTERIOR NO SE TOCA ---------------------- */

/* Un proyecto guardado por una versión anterior, sin `finanzas` por ninguna
   parte: es como están hoy los ocho de producción. Se siembra en la lista de
   proyectos del modo local —no en la llave del respaldo— y se abre desde la
   portada, para que el recorrido sea el mismo que el de un proyecto real y el
   guardado escriba donde de verdad escribiría. */
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

test("un proyecto guardado sin finanzas abre y la sección se pinta en cero",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoHeredado();
    await irAFinanzas(pagina);
    assert.ok(num(await pagina.locator("#fin_capex").textContent()) > 0,
      "el CAPEX viene del presupuesto, que sí existe");
    assert.equal(num(await pagina.locator("#fin_opex_mes").textContent()), 0);
    assert.equal(await pagina.locator("#fin_ninv").textContent(), "0");
    await irAFinanzas(pagina, "opex");
    assert.equal(await pagina.locator("#fin_opex_body tr").count(), 0);
    await pagina.close();
  });

test("abrir Finanzas en un proyecto anterior no le escribe nada", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  /* Es la condición que puso RG para los proyectos que ya existen: mirar no
     puede modificar. Se recorren las cuatro pantallas y se compara la huella
     completa del almacenamiento. */
  const pagina = await conProyectoHeredado();
  await pagina.waitForTimeout(1200);
  const huella = () => pagina.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); o[k] = localStorage.getItem(k);
    }
    return JSON.stringify(o);
  });
  const antes = await huella();

  for (const panel of ["res", "opex", "inv", "vista"]) {
    await irAFinanzas(pagina, panel);
    await pagina.waitForTimeout(200);
  }
  await pagina.waitForTimeout(1500);

  assert.equal(await huella(), antes,
    "recorrer Finanzas no puede marcar el proyecto como sucio ni guardarlo");
  const p = await proyectoGuardado(pagina);
  assert.equal("finanzas" in p.estado, false,
    "y el estado guardado del proyecto sigue sin la llave finanzas");
  assert.equal(p.actualizado_en, PROYECTO_HEREDADO.actualizado_en,
    "la marca de tiempo del proyecto no se movió por abrir Finanzas");
  await pagina.close();
});

test("capturar en Finanzas sí guarda, y sólo entonces aparece la llave",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoHeredado();
    await irAFinanzas(pagina, "opex");
    await pagina.locator("#fin_add_opex").click();
    await pagina.locator('#fin_opex_body input[data-campo="concepto"]').first()
      .fill("Vigilancia");
    await pagina.locator('#fin_opex_body input[data-campo="monto"]').first()
      .fill("35000");
    // El guardado automático de la aplicación corre a los 700 ms.
    await pagina.waitForTimeout(1600);

    const p = await proyectoGuardado(pagina);
    assert.ok(p.estado.finanzas, "ahora sí tiene que estar la llave");
    assert.equal(p.estado.finanzas.v, 1, "con su propia versión");
    assert.equal(p.estado.finanzas.opex.length, 1);
    assert.equal(p.estado.finanzas.opex[0].monto, 35000);
    assert.equal(p.estado.finanzas.opex[0].concepto, "Vigilancia");
    // Y el resto del estado del proyecto sigue intacto.
    assert.equal(p.estado.cfg.nom, "Estación heredada — sin finanzas");
    assert.equal(p.estado.cfg.kva, "1000");
    await pagina.close();
  });
