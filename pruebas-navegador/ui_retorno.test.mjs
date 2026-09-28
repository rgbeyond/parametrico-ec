/* Regreso al portal después de iniciar sesión (issue #9).
   =======================================================

   EL FALLO QUE ESTAS PRUEBAS FIJAN
   --------------------------------
   RG abría la liga del portal de Ecatepec, no tenía sesión, la página lo
   mandaba a la raíz, entraba, OAuth lo devolvía a la raíz… y acababa en la
   aplicación interna, sin el portal y sin el identificador del proyecto.

   POR QUÉ ESTAS PRUEBAS NECESITAN SU PROPIA COMPILACIÓN
   -----------------------------------------------------
   El tramo que importa —volver **con sesión válida**— no se puede ejercitar
   sin nube: sin `VITE_SUPABASE_URL` el cliente ni siquiera existe y
   `sesion.perfil` nunca llega a ser verdadero.

   Así que estas pruebas usan `dist-prueba`, compilada contra un doble local
   que la propia prueba levanta, y siembran una sesión en el almacenamiento con
   la misma llave que usa la biblioteca (`sb-<host>-auth-token`, verificada en
   el paquete compilado). El doble contesta el perfil y el proyecto. **Ninguna
   base real se toca**, y la compilación que despliega Netlify no cambia.
*/

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { chromium } from "playwright";

import { LLAVE_RETORNO } from "../src/lib/retorno.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const DIST = join(aqui, "..", "dist-prueba");
const TIPOS = { ".html": "text/html", ".js": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2" };

/* Tiene que coincidir con el puerto que `scripts/build-prueba.mjs` dejó
   escrito dentro del paquete. */
const PUERTO_DOBLE = 54321;
/* La llave que usa supabase-js: `sb-${hostname.split(".")[0]}-auth-token`.
   Con el doble en 127.0.0.1, el primer segmento es «127». */
const LLAVE_SESION = "sb-127-auth-token";

const ID = "038f0972-16de-4c5c-830d-9b0729022c10";
const RUTA_PORTAL = `/portal-inversionista.html?proyecto=${ID}`;

const PROYECTO = {
  id: ID, nombre: "Estación de Carga Ecatepec (Dave)",
  ubicacion: "Ecatepec, Estado de México",
  estado: {
    total: 41250000, directo: 31000000, clase: "Clase 4 — Preliminar", idd: 0.41,
    cfg: {
      grupos: [{ kw: 240, con: 2, q: 4 }, { kw: 120, con: 2, q: 2 }],
      kva: "1500", vmt: 23, vbt: 480, balanceo: 1, balanceoPct: 30, kwp: 400,
    },
  },
};

let sitio; let doble; let navegador; let base; let sinNavegador = false;
let peticionesDoble = [];

before(async () => {
  assert.ok(existsSync(DIST),
    "corre npm run build:prueba antes de esta prueba");
  sitio = createServer(async (req, res) => {
    const ruta = req.url.split("?")[0];
    const archivo = join(DIST, ruta === "/" ? "index.html" : ruta);
    try {
      const datos = await readFile(archivo);
      res.writeHead(200, { "content-type":
        TIPOS[extname(archivo)] ?? "application/octet-stream" });
      res.end(datos);
    } catch { res.writeHead(404).end("no"); }
  });
  await new Promise((r) => sitio.listen(0, r));
  base = `http://127.0.0.1:${sitio.address().port}`;

  /* El doble de Supabase. Sólo contesta lecturas: si alguna prueba provocara
     una escritura, quedaría registrada en `peticionesDoble` y la prueba de
     cero escrituras la vería. */
  doble = createServer((req, res) => {
    peticionesDoble.push({ metodo: req.method, url: req.url });
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    });
    if (req.method === "OPTIONS") return res.end();
    if (req.url.startsWith("/rest/v1/perfiles")) {
      return res.end(JSON.stringify([{ id: "u1", correo: "rg@beyond-ae.com",
        nombre: "RG", rol: "admin", activo: true }]));
    }
    if (req.url.startsWith("/rest/v1/proyectos")) {
      // Por identificador devuelve Ecatepec; el listado de la portada, vacío.
      return res.end(JSON.stringify(req.url.includes("id=eq.") ? [PROYECTO] : []));
    }
    return res.end("[]");
  });
  await new Promise((r, mal) => {
    doble.once("error", mal);
    doble.listen(PUERTO_DOBLE, r);
  }).catch((err) => {
    throw new Error(`No se pudo levantar el doble en ${PUERTO_DOBLE}: ${err.message}. `
      + "El puerto está escrito dentro del paquete de prueba, así que tiene que estar libre.");
  });

  const preinstalado = "/opt/pw-browsers/chromium";
  try {
    navegador = await chromium.launch(existsSync(preinstalado)
      ? { executablePath: preinstalado } : {});
  } catch (err) { sinNavegador = err.message; }
});

after(async () => {
  await navegador?.close();
  await new Promise((r) => sitio.close(r));
  await new Promise((r) => doble.close(r));
});

/* Una sesión con la forma que la biblioteca espera encontrar guardada. No es
   un token de nadie: el doble no verifica nada. */
const sesionSembrada = () => JSON.stringify({
  access_token: "token-de-prueba", refresh_token: "refresco",
  token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "u1", aud: "authenticated", role: "authenticated",
    email: "rg@beyond-ae.com", app_metadata: {}, user_metadata: {},
    created_at: "2026-01-01T00:00:00Z" },
});

/* El guion de siembra corre en CADA documento que carga la pestaña, así que
   tiene que sembrar una sola vez: si volviera a escribir la ruta de retorno
   después del salto al portal, la prueba vería la llave puesta por ella misma
   y no la que consumió la aplicación. La marca vive en el mismo
   `sessionStorage`, que sobrevive al `location.replace` dentro de la pestaña. */
const MARCA_SIEMBRA = "prueba:sembrado";

async function pagina({ conSesion = false, retorno = null } = {}) {
  peticionesDoble = [];
  const p = await navegador.newPage();
  await p.addInitScript(([llaveSesion, sesion, llaveRetorno, ruta, marca]) => {
    if (sessionStorage.getItem(marca)) return;
    sessionStorage.setItem(marca, "1");
    if (sesion) localStorage.setItem(llaveSesion, sesion);
    if (ruta) sessionStorage.setItem(llaveRetorno, ruta);
  }, [LLAVE_SESION, conSesion ? sesionSembrada() : null, LLAVE_RETORNO, retorno,
    MARCA_SIEMBRA]);
  return p;
}

const guardado = (p) => p.evaluate((k) => sessionStorage.getItem(k), LLAVE_RETORNO);

/* --- 1. SIN SESIÓN: SE ANOTA A DÓNDE VOLVER ------------------------------- */

test("el portal sin sesión anota la ruta y ofrece entrar sin salir de ahí",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const p = await pagina();
    await p.goto(base + RUTA_PORTAL, { waitUntil: "networkidle" });

    const texto = await p.locator(".estado").innerText();
    assert.ok(texto.includes("Inicia sesión para acceder a este portal"), texto);
    assert.ok(!texto.includes("vuelve a abrir la liga"),
      "ya no se le pide al usuario que navegue a mano");
    // La acción entra directo al acceso: no manda antes a la aplicación.
    assert.equal(await p.locator("#portal_accion").innerText(), "Ingresar al portal");
    assert.equal(await p.locator('.estado a[href="/"]').count(), 0,
      "quien abre un portal no tiene por qué enterarse de la herramienta interna");

    assert.equal(await guardado(p), RUTA_PORTAL,
      "la ruta exacta, con el identificador, queda anotada");
    // Y sin sesión no se pidió un solo dato.
    assert.deepEqual(peticionesDoble.filter((x) => x.url.startsWith("/rest/")), []);
    await p.close();
  });

/* --- 2, 3 y 4. EL REGRESO AUTOMÁTICO -------------------------------------- */

test("volver a la raíz con sesión válida lleva al portal sin pasar por la aplicación",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    /* Es el flujo completo: el portal anotó la ruta, OAuth devolvió al usuario
       a la raíz, y la raíz lo manda al portal ANTES de montar la portada. */
    const p = await pagina({ conSesion: true, retorno: RUTA_PORTAL });
    await p.goto(base + "/", { waitUntil: "networkidle" });

    const url = new URL(p.url());
    assert.equal(url.pathname, "/portal-inversionista.html");
    assert.equal(url.searchParams.get("proyecto"), ID,
      "y con el proyecto de Ecatepec, no con otro");

    // La llave se consumió: no puede volver a dispararse.
    assert.equal(await guardado(p), null);

    // Llegó de verdad al portal y leyó Ecatepec.
    assert.ok((await p.locator("#portal").innerText())
      .includes("Estación de Carga Ecatepec"));
    assert.ok(peticionesDoble.some((x) => x.url.includes(`id=eq.${ID}`)),
      "el portal consultó el proyecto por identificador");
    await p.close();
  });

test("después del regreso, recargar mantiene al usuario en el portal", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const p = await pagina({ conSesion: true, retorno: RUTA_PORTAL });
  await p.goto(base + "/", { waitUntil: "networkidle" });
  assert.equal(new URL(p.url()).pathname, "/portal-inversionista.html");

  peticionesDoble = [];
  await p.reload({ waitUntil: "networkidle" });
  const url = new URL(p.url());
  assert.equal(url.pathname, "/portal-inversionista.html",
    "recargar no puede devolver al usuario a la aplicación");
  assert.equal(url.searchParams.get("proyecto"), ID);
  assert.ok(peticionesDoble.some((x) => x.url.includes(`id=eq.${ID}`)),
    "y se vuelve a leer Ecatepec de la base");
  await p.close();
});

/* --- 5 y 6. NADA DE BUCLES ------------------------------------------------ */

test("sin sesión válida, una ruta pendiente no provoca un rebote", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  /* Si la raíz redirigiera sin sesión, el portal volvería a mandar a la raíz y
     el usuario quedaría rebotando. Por eso el consumo exige perfil. */
  const p = await pagina({ conSesion: false, retorno: RUTA_PORTAL });
  await p.goto(base + "/", { waitUntil: "networkidle" });
  assert.equal(new URL(p.url()).pathname, "/",
    "sin sesión el usuario se queda donde está");
  assert.equal(await guardado(p), RUTA_PORTAL,
    "y la ruta sigue esperando al siguiente intento, no se tira");
  await p.close();
});

test("el portal no rebota solo: sin sesión se queda enseñando el acceso", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const p = await pagina();
  await p.goto(base + RUTA_PORTAL, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  assert.equal(new URL(p.url()).pathname, "/portal-inversionista.html");
  await p.reload({ waitUntil: "networkidle" });
  assert.equal(new URL(p.url()).pathname, "/portal-inversionista.html",
    "recargar sin sesión tampoco puede iniciar un rebote");
  await p.close();
});

/* --- 7. DESTINOS QUE NO SE ACEPTAN ---------------------------------------- */

for (const [etiqueta, malicioso] of [
  ["un origen externo", "https://evil.com/robo"],
  ["una URL sin esquema", "//evil.com/robo"],
  ["un esquema ejecutable", "javascript:alert(1)"],
  ["otra ruta de la aplicación", "/index.html"],
]) {
  test(`un retorno a ${etiqueta} se rechaza y se borra`, async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const p = await pagina({ conSesion: true, retorno: malicioso });
    await p.goto(base + "/", { waitUntil: "networkidle" });

    const url = new URL(p.url());
    assert.equal(url.origin, base, `el usuario salió a ${url.origin}`);
    assert.equal(url.pathname, "/", "y se queda en la aplicación, como si nada");
    assert.equal(await guardado(p), null,
      "la llave envenenada no puede quedarse esperando al siguiente arranque");
    await p.close();
  });
}

/* --- CERO ESCRITURAS ------------------------------------------------------ */

test("ni el regreso ni el portal escriben nada", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const p = await pagina({ conSesion: true, retorno: RUTA_PORTAL });
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  const escrituras = peticionesDoble.filter((x) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(x.metodo));
  assert.deepEqual(escrituras, [],
    `el flujo completo tiene que ser de sólo lectura: ${JSON.stringify(escrituras)}`);
  await p.close();
});
