/* El portal de inversionistas en un navegador de verdad (issue #9).
   =================================================================

   QUÉ SE PUEDE PROBAR AQUÍ Y QUÉ NO
   ---------------------------------
   Estas pruebas corren contra el paquete compilado **sin variables de
   entorno**, así que no hay Supabase ni sesión. Eso no es una limitación: es
   justo el caso que más importa comprobar —que sin sesión la página no pida un
   solo dato— y se verifica interceptando la red.

   El camino con sesión válida **no se puede ejercitar aquí**: haría falta una
   cuenta real contra el proyecto de producción, y estas pruebas no tocan
   ninguna base. Lo que sí se comprueba sin credenciales es todo lo demás: que
   el marcado del portal no tenga controles, que no enseñe datos internos y que
   la página no escriba nunca. La validación del camino con sesión es de RG en
   la Deploy Preview.
*/

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

import { modeloPortal } from "../src/lib/portal/modelo.js";
import { portalHTML } from "../src/lib/portal/vista.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const DIST = join(aqui, "..", "dist");
const TIPOS = { ".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".mjs": "text/javascript" };

const ID_ECATEPEC = "038f0972-16de-4c5c-830d-9b0729022c10";
const PORTAL = `/portal-inversionista.html?proyecto=${ID_ECATEPEC}`;

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

/* Registra TODA petición que salga de la página, para poder afirmar que sin
   sesión no se pide un solo dato y que el portal nunca escribe. */
async function conEspiaDeRed(ruta) {
  const pagina = await navegador.newPage();
  const peticiones = [];
  pagina.on("request", (r) => peticiones.push({ url: r.url(), metodo: r.method() }));
  await pagina.goto(base + ruta, { waitUntil: "networkidle" });
  return { pagina, peticiones };
}

const deDatos = (peticiones) => peticiones.filter((p) =>
  /supabase|\/rest\/v1\/|\/auth\/v1\//.test(p.url));

/* --- LA PÁGINA EXISTE Y ES UNA PÁGINA APARTE ------------------------------ */

test("el portal es una página propia y no arranca el estimador", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const { pagina, peticiones } = await conEspiaDeRed(PORTAL);
  assert.equal(await pagina.title(), "Portal de inversionistas · Beyond");
  // Ni el shell interno ni sus pestañas existen aquí.
  for (const sel of ["#estimador", "#portada", "#wsNav", ".tabs", "#p-fin"]) {
    assert.equal(await pagina.locator(sel).count(), 0,
      `el portal no puede traer ${sel}`);
  }
  // Y no se descargó el paquete del estimador.
  assert.ok(!peticiones.some((p) => /\/assets\/app-/.test(p.url)),
    "el portal no debe cargar app.js");
  await pagina.close();
});

test("el aviso de demostración está desde el primer instante", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await navegador.newPage();
  // Sin esperar a la red: el aviso va en el marcado, no en el JavaScript.
  await pagina.goto(base + PORTAL, { waitUntil: "domcontentloaded" });
  const banda = await pagina.locator(".banda").innerText();
  assert.ok(banda.includes("DEMO / DEV"));
  assert.ok(banda.includes("no es una frontera de seguridad")
    || banda.includes("no es la"), banda);
  await pagina.close();
});

/* --- SIN SESIÓN NO SE PIDE UN SOLO DATO ----------------------------------- */

test("sin sesión: pantalla de acceso y cero peticiones de datos",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const { pagina, peticiones } = await conEspiaDeRed(PORTAL);
    const texto = await pagina.locator(".estado").innerText();
    assert.ok(texto.includes("Inicia sesión para acceder a este portal"), texto);
    /* La acción entra directo al acceso desde aquí. Quien abre la liga de un
       portal no tiene por qué enterarse de que detrás hay una herramienta
       administrativa, ni navegar a ella a mano. */
    assert.equal(await pagina.locator("#portal_accion").count(), 1);
    assert.equal(await pagina.locator('.estado a[href="/"]').count(), 0);

    assert.deepEqual(deDatos(peticiones), [],
      "sin sesión no puede salir una sola petición de datos");
    // Y no se pintó nada del proyecto.
    assert.equal(await pagina.locator("[data-seccion]").count(), 0);
    await pagina.close();
  });

test("el portal nunca escribe: sólo hace peticiones de lectura", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const { pagina, peticiones } = await conEspiaDeRed(PORTAL);
  const escrituras = peticiones.filter((p) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(p.metodo));
  assert.deepEqual(escrituras, [],
    "esta iteración es de sólo lectura: ni un POST, PATCH o DELETE");
  await pagina.close();
});

test("una liga sin identificador no consulta nada", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const { pagina, peticiones } = await conEspiaDeRed("/portal-inversionista.html");
  assert.deepEqual(deDatos(peticiones), []);
  await pagina.close();
});

test("un identificador con forma inválida no se manda a la base", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const { pagina, peticiones } = await conEspiaDeRed(
    "/portal-inversionista.html?proyecto=' or 1=1--");
  assert.deepEqual(deDatos(peticiones), []);
  await pagina.close();
});

/* --- EL DOCUMENTO PINTADO -------------------------------------------------
   El marcado se genera con las mismas funciones puras que usa la página y se
   inyecta en un documento real: así se comprueba sobre el DOM —no sobre una
   cadena— que no hay un solo control y que no asoma nada interno. */

const PROYECTO = {
  id: ID_ECATEPEC,
  clave: "estacion-de-carga-ecatepec-dave-y7jy",
  nombre: "Estación de Carga Ecatepec (Dave)",
  ubicacion: "Ecatepec, Estado de México",
  estado: {
    total: 41250000, directo: 31000000, clase: "Propuesta preliminar", idd: 0.41,
    cfg: {
      grupos: [{ kw: 240, con: 2, q: 4 }, { kw: 120, con: 2, q: 2 }],
      kva: "1500", vmt: 23, vbt: 480, balanceo: 1, balanceoPct: 30,
      kwp: 400, bess: 2, besskwh: 261, besskw: 125,
      tarifaDiv: "Valle de México Norte", cargoCap: 350.90, enPunta: 1.6703,
    },
    edits: { "MT-015": { pu: 1270500 } },
    comentarios: [{ autor: "rg@beyond-ae.com", texto: "ojo con el trafo" }],
  },
};

async function conDocumentoPintado() {
  const pagina = await navegador.newPage();
  await pagina.goto(base + PORTAL, { waitUntil: "networkidle" });
  const html = portalHTML(modeloPortal(PROYECTO, null, { version: "v0.16.0" }));
  await pagina.evaluate((h) => {
    document.getElementById("portal").innerHTML = h;
    document.querySelectorAll("[data-seccion]").forEach((s) => { s.hidden = false; });
  }, html);
  return pagina;
}

test("el documento del portal no tiene un solo control en el DOM", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conDocumentoPintado();
  const controles = await pagina.locator(
    "#portal input, #portal select, #portal textarea, #portal button, "
    + "#portal form, #portal [contenteditable]").count();
  assert.equal(controles, 0, "el portal es de sólo lectura");
  await pagina.close();
});

test("el documento enseña el proyecto y no los datos internos", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conDocumentoPintado();
  const texto = await pagina.locator("#portal").innerText();
  for (const dato of ["Estación de Carga Ecatepec", "Ecatepec, Estado de México",
    "$41,250,000", "1,200 kW", "840 kW", "720 kW", "1,500 kVA", "400 kWp",
    "Proyección financiera pendiente de publicación"]) {
    assert.ok(texto.includes(dato), `falta «${dato}» en el portal`);
  }
  const html = await pagina.locator("#portal").innerHTML();
  for (const rastro of ["MT-015", "1270500", "beyond-ae.com", "ojo con el trafo",
    "350.9", "1.6703", "estacion-de-carga-ecatepec-dave-y7jy"]) {
    assert.ok(!html.includes(rastro), `el portal está enseñando «${rastro}»`);
  }
  await pagina.close();
});

/* --- EL ENLACE DESDE LA APLICACIÓN ---------------------------------------- */

test("sin proyecto en la nube, la aplicación no ofrece la liga del portal",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    /* En modo local no hay identificador de proyecto contra el que abrir el
       portal, así que ofrecer el enlace sería ofrecer una liga rota. Con
       sesión y proyecto en la nube el enlace aparece; eso lo valida RG en la
       preview, que es donde hay Supabase. */
    const pagina = await navegador.newPage();
    await pagina.goto(base, { waitUntil: "domcontentloaded" });
    await pagina.locator('[data-acc="plantilla"], [data-acc="abrir"]').first()
      .click({ timeout: 20000 });
    await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
    await pagina.locator('[data-ws="opex"]').click();
    await pagina.locator('#finNav [data-fin="vista"]').click();
    await pagina.locator("#fin-pub").waitFor({ timeout: 20000 });
    assert.equal(await pagina.locator("#fin_portal").isVisible(), false);
    await pagina.close();
  });
