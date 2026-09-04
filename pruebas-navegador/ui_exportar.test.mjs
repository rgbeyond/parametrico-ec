/* Exportar el catálogo del proyecto, en un navegador de verdad (issue #4).
   ========================================================================

   POR QUÉ ESTA CARPETA ESTÁ SEPARADA DE `pruebas/`
   ------------------------------------------------
   `pruebas/` corre en Node sin navegador ni credenciales, y eso es una decisión
   documentada de este repositorio: `npm test` tiene que poder correr en
   cualquier parte. Pero lo que RG pidió demostrar —que el archivo dice lo MISMO
   que la pantalla— no se puede probar sin una pantalla. De ahí `npm run
   test:ui`, con Chromium, igual que en el repositorio hermano.

   EL FIXTURE ES LA PLANTILLA DE ATLACOMULCO, NO UN PROYECTO REAL
   --------------------------------------------------------------
   Sin variables de entorno la aplicación corre contra el navegador, sin nube y
   sin sesión, y su portada ofrece cargar «Atlacomulco Fase 1», que es el caso
   de referencia del repositorio. Así la prueba no toca ninguna base: ni PROD
   —donde viven los ocho proyectos de RG— ni DEV.
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

/* SE CAPTURA EL `srcdoc`, NO EL `print()`.
   La app manda el documento a un iframe con `srcdoc` y llama al `print()` de
   ESE iframe, que vive en otro realm: sustituir `Window.prototype.print` en la
   página principal no lo alcanza. El `srcdoc` sí, y además es exactamente el
   HTML que se imprimiría. Se intercepta el descriptor y se delega en el
   original, así que la app sigue funcionando igual.
   `print` también se neutraliza: el diálogo del sistema colgaría la prueba.
   Va en una función porque la necesitan TODOS los ayudantes que abren página:
   el que no la tenía dejaba `__impreso` en null y la prueba expiraba. */
const interceptarImpresion = (pagina) => pagina.addInitScript(() => {
  window.__impreso = null;
  const d = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype, "srcdoc");
  Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
    ...d,
    set(v) { try { window.top.__impreso = v; } catch { /* nada */ } d.set.call(this, v); },
  });
  Window.prototype.print = function sustituta() { return undefined; };
});

/* Abre la plantilla de Atlacomulco y deja la pantalla en el Catálogo, que es
   donde vive Exportar. Devuelve la página lista para leer la tabla. */
async function conProyectoAbierto() {
  const pagina = await navegador.newPage({ acceptDownloads: true });
  await interceptarImpresion(pagina);
  await pagina.goto(base, { waitUntil: "domcontentloaded" });
  await pagina.locator('[data-acc="plantilla"]').click({ timeout: 20000 });
  await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
  await pagina.locator('.tab[data-t="boq"]').click();
  await pagina.locator("#b_body tr").first().waitFor({ timeout: 20000 });
  return pagina;
}

/* Lo que la PANTALLA dice, leído del DOM: la fuente contra la que se compara
   el archivo. Se leen los renglones activos, que son los que tienen cantidad
   mayor que cero, en el mismo orden en que están pintados. */
function leerPantalla(pagina) {
  return pagina.evaluate(() => {
    const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ""));
    const filas = [...document.querySelectorAll("#b_body tr")]
      .filter((tr) => !tr.classList.contains("catrow"));
    const renglones = filas.map((tr) => {
      const td = tr.querySelectorAll("td");
      return {
        codigo: td[0].textContent.trim(),
        concepto: td[1].textContent.trim(),
        unidad: td[2].textContent.trim(),
        cantidad: num(td[3].querySelector("input").value),
        pu: num(td[4].querySelector("input").value),
        importe: num(td[5].textContent),
        sustento: td[6].querySelector("select").selectedOptions[0].textContent.trim(),
      };
    }).filter((r) => r.cantidad > 0);
    return { renglones, conteo: document.getElementById("b_count").textContent };
  });
}

/* Un lector de CSV con las reglas del RFC 4180, igual que en la prueba de
   Node: comparar subcadenas daría verde a columnas corridas. */
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

async function exportarCSV(pagina) {
  const esperada = pagina.waitForEvent("download", { timeout: 20000 });
  await pagina.locator("#x_menu > summary").click();
  await pagina.locator("#x_csv").click();
  const descarga = await esperada;
  const ruta = await descarga.path();
  return { nombre: descarga.suggestedFilename(),
    texto: await readFile(ruta, "utf8") };
}

test("el CSV dice lo mismo que la pantalla, renglón por renglón", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  const pantalla = await leerPantalla(pagina);
  const { nombre, texto } = await exportarCSV(pagina);

  assert.match(nombre, /^catalogo-.*-\d{4}-\d{2}-\d{2}\.csv$/, nombre);
  const filas = leerCSV(texto);
  const iEnc = filas.findIndex((f) => f[0] === "Código");
  const resto = filas.slice(iEnc + 1);
  const fin = resto.findIndex((f) => f.every((v) => v === ""));
  const datos = fin === -1 ? resto : resto.slice(0, fin);

  assert.ok(pantalla.renglones.length > 20,
    `la plantilla debería traer decenas de renglones activos, trajo ${pantalla.renglones.length}`);
  assert.equal(datos.length, pantalla.renglones.length,
    "el archivo trae exactamente los renglones activos de la pantalla");

  const col = (f, n) => f[["Código", "Categoría", "Concepto", "Unidad",
    "Cantidad", "Precio unitario", "Importe", "Sustento", "Tratamiento",
    "Base del número"].indexOf(n)];
  for (const [i, p] of pantalla.renglones.entries()) {
    const f = datos[i];
    assert.equal(col(f, "Código"), p.codigo, `renglón ${i}: código`);
    assert.equal(col(f, "Concepto"), p.concepto, `${p.codigo}: concepto`);
    assert.equal(col(f, "Unidad"), p.unidad, `${p.codigo}: unidad`);
    assert.equal(Number(col(f, "Cantidad")), p.cantidad, `${p.codigo}: cantidad`);
    assert.equal(Number(col(f, "Precio unitario")), p.pu, `${p.codigo}: P.U.`);
    assert.equal(Number(col(f, "Importe")), p.importe, `${p.codigo}: importe`);
    assert.equal(col(f, "Sustento"), p.sustento, `${p.codigo}: sustento`);
  }
  // Y el conteo que el chip de la pantalla anuncia es el del archivo.
  assert.match(pantalla.conteo,
    new RegExp(`^${pantalla.renglones.length} de \\d+ renglones activos$`));
  await pagina.close();
});

test("los totales del CSV son los que muestra la aplicación", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  const { texto } = await exportarCSV(pagina);
  const filas = leerCSV(texto);
  const importeDe = (etiqueta) => {
    const f = filas.find((x) => x[0].startsWith(etiqueta));
    assert.ok(f, `el archivo no trae el renglón "${etiqueta}"`);
    return Number(f[6]);
  };
  /* La pantalla de Propuesta imprime los mismos totales con formato de pesos.
     Se leen de ahí y se comparan contra el archivo: si el export recalculara
     por su cuenta, aquí se vería. */
  await pagina.locator('.tab[data-t="exp"]').click();
  /* `#e_doc` está oculto a propósito: es la fuente del documento que se pinta
     en el iframe de previsualización, no un bloque de pantalla. Se espera a que
     TENGA contenido, no a que sea visible. */
  await pagina.waitForFunction(
    () => document.querySelector("#e_doc table") != null,
    null, { timeout: 20000 });
  const doc = await pagina.evaluate(() => {
    const num = (s) => Number(String(s).replace(/[^0-9.\-]/g, ""));
    const filas = [...document.querySelectorAll("#e_doc table tr")];
    const buscar = (txt) => {
      const tr = filas.find((x) => x.cells[0]?.textContent.includes(txt));
      return tr ? num(tr.cells[1].textContent) : null;
    };
    return { subtotal: buscar("Subtotal de obra y equipo"),
      total: buscar("Inversión total") };
  });
  assert.equal(importeDe("Subtotal de obra y equipo"), doc.subtotal);
  assert.equal(importeDe("Inversión total, más IVA"), doc.total);
  await pagina.close();
});

test("el documento imprimible no trae controles y sí trae la tabla",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoAbierto();
    await pagina.locator("#x_menu > summary").click();
    await pagina.locator("#x_pdf").click();
    await pagina.waitForFunction(() => window.__impreso, null, { timeout: 30000 });
    const html = await pagina.evaluate(() => window.__impreso);

    for (const etiqueta of ["<input", "<select", "<button", "<textarea"]) {
      assert.ok(!html.toLowerCase().includes(etiqueta),
        `el documento que se manda a imprimir no puede traer ${etiqueta}`);
    }
    assert.ok(html.includes("Catálogo de conceptos del proyecto"));
    assert.ok(html.includes("Inversión total, más IVA"));
    assert.ok(html.includes("BEYOND AE"));
    // El logo va incrustado: un documento guardado como PDF no puede depender
    // de una ruta del sitio.
    assert.match(html, /<img src="data:image\/png;base64,/);
    await pagina.close();
  });

test("exportar no modifica el proyecto ni su estado guardado", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await conProyectoAbierto();
  /* La huella de TODO lo que la aplicación persiste en este modo. Si exportar
     tocara el proyecto —marcándolo sucio y disparando un guardado— esta huella
     cambiaría. Es la comprobación que RG pidió para los proyectos que ya
     existen: exportar es una operación de lectura. */
  const huella = () => pagina.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); o[k] = localStorage.getItem(k);
    }
    return JSON.stringify(o);
  });
  // Se espera a que el guardado propio de la apertura se asiente.
  await pagina.waitForTimeout(1500);
  const antes = await huella();

  await exportarCSV(pagina);
  await pagina.locator("#x_pdf").click();
  await pagina.waitForFunction(() => window.__impreso, null, { timeout: 30000 });
  await pagina.waitForTimeout(1500);

  assert.equal(await huella(), antes,
    "exportar no puede escribir nada: ni estado, ni marca de tiempo");
  await pagina.close();
});

test("el menú Exportar vive en la sección del catálogo y se usa en móvil",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conProyectoAbierto();
    // Está dentro de la sección del presupuesto, no en una pestaña nueva.
    assert.equal(await pagina.locator("#p-boq #x_menu").count(), 1);
    assert.equal(await pagina.locator(".tab").count(), 8,
      "no se agregó ninguna pestaña");

    await pagina.setViewportSize({ width: 390, height: 844 });
    const sum = pagina.locator("#x_menu > summary");
    const caja = await sum.boundingBox();
    assert.ok(caja.height >= 36 && caja.width >= 44,
      `el disparador mide ${Math.round(caja.width)}x${Math.round(caja.height)}: `
      + "no se acierta con el pulgar");
    await sum.click();
    for (const id of ["#x_csv", "#x_pdf"]) {
      const b = await pagina.locator(id).boundingBox();
      assert.ok(b && b.height >= 36, `${id} mide ${b && Math.round(b.height)} px de alto`);
      // Y el menú no se sale de la pantalla.
      assert.ok(b.x >= 0 && b.x + b.width <= 390 + 1,
        `${id} se sale del viewport: x=${Math.round(b.x)} w=${Math.round(b.width)}`);
    }
    assert.equal(await pagina.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1), true,
    "abrir el menú no puede desplazar la página de lado");
    await pagina.close();
  });

/* --- COMPATIBILIDAD CON ESTADOS GUARDADOS ANTERIORES ---------------------
   Lo pidió la revisión previa a promover: los 8 proyectos que viven en
   producción se guardaron con versiones anteriores, y este hotfix sale de
   `main`. Lo que hay que demostrar no es que el export sea bonito, sino que
   un estado viejo ABRE, se COTIZA y se EXPORTA igual, y que exportar no le
   quita nada de lo que traía.

   Los dos fixtures son sintéticos y cubren los dos lados del problema:
   - `VIEJO`: un estado mínimo, sin las llaves que la aplicación fue
     agregando después. La carga mezcla con `Object.assign` sobre los valores
     por omisión, así que lo que falta se completa.
   - `FUTURO`: un estado con una llave que ESTA versión no conoce. Es el caso
     real si un proyecto se editó con una versión posterior: la llave tiene
     que sobrevivir intacta, no desaparecer por haber abierto y exportado. */
const VIEJO = { v: 1, cfg: {
  nom: "Estación heredada — estado mínimo", loc: "Toluca, Estado de México",
  modo: "propia", kva: 1000,
  grupos: [{ kw: 120, q: 2, con: 2 }],
}, edits: {}, genEdits: {}, genApproved: {} };

const FUTURO = { v: 1, cfg: {
  ...VIEJO.cfg, nom: "Estación con llave desconocida",
  // Una llave que esta versión no lee ni escribe.
  ambitoFuturoQueEstaVersionNoConoce: { a: 1, b: ["dos"] },
}, edits: { "MT-001": { pu: 999999 } }, genEdits: {}, genApproved: {} };

async function conEstadoSembrado(estado) {
  const pagina = await navegador.newPage({ acceptDownloads: true });
  await interceptarImpresion(pagina);
  await pagina.addInitScript(([clave, valor]) => {
    localStorage.setItem(clave, valor);
  }, ["beyond:est:proyecto-activo", JSON.stringify(estado)]);
  await pagina.goto(base, { waitUntil: "domcontentloaded" });
  await pagina.locator('[data-acc="plantilla"], [data-acc="abrir"]').first()
    .click({ timeout: 20000 });
  await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
  await pagina.locator('.tab[data-t="boq"]').click();
  await pagina.locator("#b_body tr").first().waitFor({ timeout: 20000 });
  return pagina;
}

for (const [etiqueta, estado] of [["mínimo y antiguo", VIEJO],
  ["con una llave que esta versión no conoce", FUTURO]]) {
  test(`un estado guardado ${etiqueta} abre, cotiza y exporta`, async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conEstadoSembrado(estado);
    const pantalla = await leerPantalla(pagina);
    assert.ok(pantalla.renglones.length > 20,
      `un estado ${etiqueta} tiene que producir catálogo: trajo `
      + `${pantalla.renglones.length} renglones`);

    const { texto } = await exportarCSV(pagina);
    const filas = leerCSV(texto);
    const iEnc = filas.findIndex((f) => f[0] === "Código");
    const resto = filas.slice(iEnc + 1);
    const fin = resto.findIndex((f) => f.every((v) => v === ""));
    const datos = fin === -1 ? resto : resto.slice(0, fin);
    assert.equal(datos.length, pantalla.renglones.length,
      "el archivo trae los mismos renglones activos que la pantalla");
    for (const [i, p] of pantalla.renglones.entries()) {
      assert.equal(datos[i][0], p.codigo, `renglón ${i}`);
      assert.equal(Number(datos[i][6]), p.importe, `${p.codigo}: importe`);
    }
    await pagina.close();
  });
}

test("exportar no le quita nada al estado guardado de un proyecto anterior",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await conEstadoSembrado(FUTURO);
    await pagina.waitForTimeout(1500);
    const leer = () => pagina.evaluate((k) => localStorage.getItem(k),
      "beyond:est:proyecto-activo");
    const antes = await leer();

    await exportarCSV(pagina);
    await pagina.locator("#x_pdf").click();
    await pagina.waitForFunction(() => window.__impreso, null, { timeout: 30000 });
    await pagina.waitForTimeout(1500);

    assert.equal(await leer(), antes, "exportar no puede reescribir el estado");
    // Y la llave desconocida sigue ahí, con su contenido.
    const guardado = JSON.parse(await leer());
    assert.deepEqual(guardado.cfg.ambitoFuturoQueEstaVersionNoConoce,
      { a: 1, b: ["dos"] },
      "una llave que esta versión no conoce no puede perderse por exportar");
    assert.deepEqual(guardado.edits, { "MT-001": { pu: 999999 } },
      "las ediciones guardadas siguen intactas");
    await pagina.close();
  });

/* --- CICLO DE VIDA DEL DIÁLOGO DE IMPRESIÓN ------------------------------
   Esta es la prueba que faltaba, y su ausencia es la razón de que el PDF en
   blanco llegara hasta la validación de RG.

   La prueba anterior sustituye `print()` por una función vacía y captura el
   `srcdoc`: demuestra que el HTML se construye, y no puede ver lo que de
   verdad falló. En Chrome `print()` DEVUELVE EL CONTROL antes de que la
   previsualización termine de consumir el documento; el ayudante borraba el
   iframe al segundo y a Chrome se le quitaba el documento de debajo.

   Aquí `print()` se sustituye por algo que IMITA ese comportamiento: no hace
   nada de inmediato, y 2.5 segundos después —cuando la implementación
   anterior ya habría borrado el iframe— comprueba si el marco sigue conectado
   y si su documento todavía tiene contenido. Sólo entonces emite `afterprint`,
   como haría el navegador al cerrarse el diálogo, y verifica que la limpieza
   ocurra ahí y no antes.

   Con `setTimeout(..., 1000)` esta prueba se pone roja: es su propósito. */
/* El espía se instala desde el realm PADRE, no dentro del iframe.
   `addInitScript` no alcanza el realm de un iframe `srcdoc` —ya se vio con la
   otra prueba—, así que sustituir `Window.prototype.print` ahí dentro no sirve.
   Lo que sí funciona: interceptar el descriptor de `contentWindow` en el padre
   y, la primera vez que alguien lo lee, poner un `print` propio en ESA ventana.
   La aplicación lee `iframe.contentWindow` dentro de su manejador de `load` y
   sólo después llama a `print()`, así que el espía siempre llega antes. */
const espiaImpresion = (pagina) => pagina.addInitScript(() => {
  window.__vida = { llamadas: 0, vivoDespues: null, textoDespues: null,
    ancho: null, alto: null, quitadoTrasAfterprint: null };
  const d = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype, "contentWindow");
  Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
    ...d,
    get() {
      const w = d.get.call(this);
      if (w && !w.__espiado) {
        try {
          w.__espiado = 1;
          const marco = this;
          const addOrig = w.addEventListener.bind(w);
          w.addEventListener = (tipo, fn, o) => {
            if (tipo === "afterprint") window.__vida.oyente = true;
            return addOrig(tipo, fn, o);
          };
          w.print = function espia() {
            const v = window.__vida;
            v.llamadas += 1;
            v.ancho = marco.offsetWidth; v.alto = marco.offsetHeight;
            v.idMarco = marco.id || "(sin id)";
            v.iframes = document.querySelectorAll("iframe").length;
            try { v.urlAlImprimir = w.location.href; } catch { v.urlAlImprimir = "?"; }
            try {
              v.textoAlImprimir = w.document.body
                ? w.document.body.innerText.length : 0;
            } catch { v.textoAlImprimir = -1; }
            // 2.5 s: más de lo que tardaba la versión rota en borrar el iframe.
            setTimeout(() => {
              let texto = -1;
              try {
                texto = w.document.body ? w.document.body.innerText.length : 0;
              } catch { texto = -1; }
              v.vivoDespues = !!(marco && marco.isConnected);
              v.textoDespues = texto;
              // El diálogo "se cierra": el navegador emitiría afterprint.
              try { window.__vida.emitido = w.dispatchEvent(new Event("afterprint")); }
              catch (e) { window.__vida.emitido = "ERROR " + e.message; }
              setTimeout(() => {
                v.quitadoTrasAfterprint = !(marco && marco.isConnected);
              }, 400);
            }, 2500);
          };
        } catch { /* otro origen: no aplica aquí */ }
      }
      return w;
    },
  });
});

async function medirVida(pagina) {
  await pagina.waitForFunction(
    () => window.__vida && window.__vida.quitadoTrasAfterprint !== null,
    null, { timeout: 30000 });
  return pagina.evaluate(() => window.__vida);
}

function revisarVida(v, quien) {
  assert.equal(v.llamadas, 1, `${quien}: se llamó a print() una vez`);
  /* EL SÍNTOMA QUE REPORTÓ RG, EN UNA LÍNEA. Un iframe recién conectado emite
     un `load` por su `about:blank` inicial: si el ayudante imprime en ese
     momento, manda a la impresora un documento vacío. */
  assert.notEqual(v.urlAlImprimir, "about:blank",
    `${quien}: se llamó a print() sobre el about:blank inicial del iframe. Eso `
    + "es exactamente el PDF en blanco");
  assert.ok(v.textoAlImprimir > 200,
    `${quien}: al llamar a print() el documento tenía ${v.textoAlImprimir} `
    + "caracteres. Se estaría imprimiendo una hoja vacía");
  assert.equal(v.vivoDespues, true,
    `${quien}: el iframe YA NO EXISTÍA 2.5 s después de print(). Es el defecto `
    + "que dejó el PDF en blanco: Chrome sigue consumiendo el documento "
    + "después de que print() devuelve, y se le quitó de debajo");
  assert.ok(v.textoDespues > 200,
    `${quien}: el documento quedó vacío mientras el diálogo seguía abierto `
    + `(${v.textoDespues} caracteres)`);
  assert.ok(v.ancho > 100 && v.alto > 100,
    `${quien}: el iframe mide ${v.ancho}x${v.alto}. Un marco colapsado no da `
    + "composición, y sin composición puede no haber nada que paginar");
  assert.equal(v.quitadoTrasAfterprint, true,
    `${quien}: el iframe tiene que retirarse al terminar el diálogo. `
    + `oyente=${v.oyente} emitido=${v.emitido} marco=${v.idMarco} `
    + `iframes=${v.iframes}`);
}

test("el documento del BOM sigue vivo mientras Chrome imprime", async (t) => {
  if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
  const pagina = await navegador.newPage({ acceptDownloads: true });
  await espiaImpresion(pagina);
  await pagina.goto(base, { waitUntil: "domcontentloaded" });
  await pagina.locator('[data-acc="plantilla"], [data-acc="abrir"]').first()
    .click({ timeout: 20000 });
  await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
  await pagina.locator('.tab[data-t="boq"]').click();
  await pagina.locator("#b_body tr").first().waitFor({ timeout: 20000 });

  await pagina.locator("#x_menu > summary").click();
  await pagina.locator("#x_pdf").click();
  revisarVida(await medirVida(pagina), "BOM");
  await pagina.close();
});

/* El ayudante lo comparte la descarga de propuesta, que existía desde antes:
   si el arreglo la rompiera, se rompería una salida que ya funcionaba. */
test("la impresión de Propuesta usa el mismo ayudante y también sobrevive",
  async (t) => {
    if (sinNavegador) return t.skip(`sin Chromium: ${sinNavegador}`);
    const pagina = await navegador.newPage({ acceptDownloads: true });
    await espiaImpresion(pagina);
    await pagina.goto(base, { waitUntil: "domcontentloaded" });
    await pagina.locator('[data-acc="plantilla"], [data-acc="abrir"]').first()
      .click({ timeout: 20000 });
    await pagina.locator("#p-conf").waitFor({ timeout: 20000 });
    await pagina.locator('.tab[data-t="exp"]').click();
    await pagina.waitForFunction(
      () => document.querySelector("#e_doc table") != null,
      null, { timeout: 20000 });

    // «Descargar propuesta» baja un respaldo .html y abre el diálogo.
    const respaldo = pagina.waitForEvent("download", { timeout: 30000 });
    await pagina.locator("#b_dl").click();
    const d = await respaldo;
    assert.match(d.suggestedFilename(), /-propuesta\.html$/);
    revisarVida(await medirVida(pagina), "Propuesta");
    await pagina.close();
  });
