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

/* Abre la plantilla de Atlacomulco y deja la pantalla en el Catálogo, que es
   donde vive Exportar. Devuelve la página lista para leer la tabla. */
async function conProyectoAbierto() {
  const pagina = await navegador.newPage({ acceptDownloads: true });
  /* SE CAPTURA EL `srcdoc`, NO EL `print()`.
     La app manda el documento a un iframe con `srcdoc` y llama al `print()` de
     ESE iframe, que vive en otro realm: sustituir `Window.prototype.print` en
     la página principal no lo alcanza. El `srcdoc` sí, y además es exactamente
     el HTML que se imprimiría. Se intercepta el descriptor y se delega en el
     original, así que la app sigue funcionando igual.
     `print` también se neutraliza: el diálogo del sistema colgaría la prueba. */
  await pagina.addInitScript(() => {
    window.__impreso = null;
    const d = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype, "srcdoc");
    Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
      ...d,
      set(v) { try { window.top.__impreso = v; } catch { /* nada */ } d.set.call(this, v); },
    });
    Window.prototype.print = function sustituta() { return undefined; };
  });
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
