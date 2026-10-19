/* El build integrado en beyond core con el encabezado común (UI-01).
   ================================================================

   Contrato de interfaz común `beyond-ui-contract/v1` (rgbeyond/beyond-platform,
   docs/arquitectura/contrato-interfaz-v1.md): «← beyond core», tema y cuenta
   informativa; sin «Salir» ni «Entrar»; tema común del origen; y el regreso
   pregunta si el estimador tiene cambios sin guardar o un guardado en vuelo.

   Compila el build de Platform (`VITE_BEYOND_PLATFORM=1`, base /ec/) contra
   un Supabase de mentira que no existe: toda la red la sustituye la prueba.
   El build standalone y sus pruebas no se tocan. La paridad visual con Core y
   Energía, el tamaño táctil y el contraste se miden en la composición de Core
   (beyond-platform, pruebas/composicion-real.mjs). */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { build } from "vite";
import { chromium } from "playwright";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..");
const DIST = join(raiz, "dist-platform-prueba");
const REF = "ejemplo-de-prueba";
const USUARIO = "eeeeeeee-1111-4111-8111-111111111111";
const PROYECTO = { id: "0b6c8a1e-0000-4000-8000-0000000000aa", clave: "estacion-de-prueba", nombre: "Estación de prueba",
  ubicacion: "Municipio, Estado", estado: {}, archivado: false,
  creado_en: "2026-09-01T00:00:00.000Z", actualizado_en: "2026-09-01T00:00:00.000Z" };
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".svg": "image/svg+xml" };

let servidor; let navegador; let base;

before(async () => {
  process.env.VITE_BEYOND_PLATFORM = "1";
  process.env.VITE_SUPABASE_URL = `https://${REF}.supabase.co`;
  process.env.VITE_SUPABASE_ANON_KEY = "llave-anonima-de-prueba";
  await build({ root: raiz, base: "/ec/", logLevel: "warn",
    build: { outDir: join(DIST, "ec"), emptyOutDir: true } });
  servidor = createServer(async (req, res) => {
    const ruta = decodeURIComponent(req.url.split("?")[0]);
    if (ruta === "/" || ruta === "/acceso" || ruta === "/salir") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<!doctype html><title>Platform</title><p id="platform">${ruta}</p>`);
    }
    if (!ruta.startsWith("/ec/")) { res.writeHead(404); return res.end(); }
    const archivo = normalize(join(DIST, ruta));
    if (!archivo.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    try {
      const datos = await readFile(archivo);
      res.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
      res.end(datos);
    } catch {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(await readFile(join(DIST, "ec", "index.html")));
    }
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  navegador = await chromium.launch();
});

after(async () => {
  await navegador?.close();
  await new Promise((r) => servidor?.close(r));
});

async function abrir({ colorScheme = "dark" } = {}) {
  const estado = { retenerEscrituras: false, retenidas: [], escrituras: 0, dialogos: [] };
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, colorScheme });
  const pagina = await contexto.newPage();
  const fallos = [];
  pagina.on("pageerror", (e) => fallos.push(e.message));
  pagina.on("dialog", (d) => { estado.dialogos.push(d.message()); return d.dismiss(); });
  const json = (r, cuerpo) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cuerpo) });
  await pagina.route(`**://${REF}.supabase.co/**`, (r) => json(r, []));
  await pagina.route("**/rest/v1/perfiles*", (r) => json(r, { id: USUARIO, correo: "edita@beyond-ae.com", nombre: "Quien prueba", rol: "editor", activo: true }));
  await pagina.route("**/rest/v1/proyectos*", (r) => {
    if (r.request().method() === "GET") return json(r, [PROYECTO]);
    estado.escrituras++;
    const responder = () => json(r, { ...PROYECTO, ...JSON.parse(r.request().postData() || "{}") });
    if (estado.retenerEscrituras) return new Promise((soltar) => estado.retenidas.push(() => soltar(responder())));
    return responder();
  });
  const expira = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
  await pagina.addInitScript(([llave, s]) => {
    if (!sessionStorage.getItem("sembrada")) { localStorage.setItem(llave, JSON.stringify(s)); sessionStorage.setItem("sembrada", "1"); }
  }, [`sb-${REF}-auth-token`, { access_token: "token-de-prueba", token_type: "bearer", refresh_token: "r",
    expires_at: expira, expires_in: 3600 * 24 * 365,
    user: { id: USUARIO, aud: "authenticated", role: "authenticated", email: "edita@beyond-ae.com", app_metadata: {}, user_metadata: {} } }]);
  await pagina.goto(`${base}/ec/`, { waitUntil: "domcontentloaded" });
  await pagina.locator(`[data-abrir="${PROYECTO.id}"]`).waitFor({ timeout: 20000 });
  return { pagina, contexto, estado, fallos };
}

const textoRuta = (pagina) => pagina.locator(".bc-ruta").innerText().then((t) => t.replace(/\s+/g, " ").trim());

test("encabezado común: «← beyond core», tema y cuenta real; sin «Salir», «Entrar» ni logotipo repetido", async () => {
  const { pagina, contexto, fallos } = await abrir();
  assert.equal(await pagina.getAttribute(".bc-volver", "href"), "/");
  assert.equal(await pagina.getAttribute(".bc-volver", "aria-label"), "Volver a beyond core");
  assert.equal(await pagina.locator(".bc-titulo").innerText(), "Estaciones de Carga");
  await pagina.locator(".bc-cuenta-info").waitFor();
  assert.equal(await pagina.locator(".bc-cuenta-info").innerText(), "edita@beyond-ae.com · Editor");
  assert.equal(await pagina.getByRole("button", { name: /Salir|Entrar/ }).count(), 0);
  assert.equal(await pagina.locator("#portada .wordmark").isVisible(), false, "logotipo repetido bajo el encabezado");
  assert.equal(await textoRuta(pagina), "Proyectos");
  assert.deepEqual(fallos, []);
  await contexto.close();
});

test("tema claro del sistema en la primera visita: tokens claros en el estimador; la elección persiste en beyond:tema", async () => {
  const { pagina, contexto, fallos } = await abrir({ colorScheme: "light" });
  assert.equal(await pagina.evaluate(() => document.documentElement.dataset.tema), "claro");
  const fondo = () => pagina.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(await fondo(), "rgb(240, 239, 236)", "superficie base clara");
  await pagina.click(".bc-tema");
  assert.equal(await pagina.evaluate(() => localStorage.getItem("beyond:tema")), "oscuro");
  assert.equal(await fondo(), "rgb(0, 0, 0)", "vuelve al oscuro de siempre");
  assert.deepEqual(fallos, []);
  await contexto.close();
});

test("regreso con cambios del estimador: avisa mientras no se guardan; cancelar conserva ruta y valor; guardado, regresa sin preguntar", async () => {
  const { pagina, contexto, estado, fallos } = await abrir();
  await pagina.locator(`[data-abrir="${PROYECTO.id}"]`).click();
  await pagina.locator("#v_nom").waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await textoRuta(pagina), `Proyectos / ${PROYECTO.nombre}`);
  estado.retenerEscrituras = true;
  await pagina.fill("#v_nom", "Estación renombrada");
  await pagina.locator("#v_nom").dispatchEvent("input");
  // Antes de que corra el autoguardado (700 ms) y con el guardado retenido.
  await pagina.click(".bc-volver");
  await pagina.waitForTimeout(200);
  assert.equal(estado.dialogos.length, 1, "no se avisó con cambios sin guardar");
  assert.match(estado.dialogos[0], /todavía no se guardan/);
  assert.match(pagina.url(), /\/ec\/$/);
  assert.equal(await pagina.inputValue("#v_nom"), "Estación renombrada", "cancelar conserva lo capturado");
  for (let i = 0; i < 60 && !estado.retenidas.length; i++) await pagina.waitForTimeout(50);
  assert.ok(estado.retenidas.length, "el autoguardado no llegó a la red");
  await pagina.click(".bc-volver");
  await pagina.waitForTimeout(200);
  assert.equal(estado.dialogos.length, 2, "con el guardado en vuelo también se avisa");
  estado.retenerEscrituras = false;
  estado.retenidas.splice(0).forEach((soltar) => soltar());
  await pagina.locator(".dirty", { hasText: /Guardado/ }).first().waitFor({ timeout: 5000 });
  await pagina.click(".bc-volver");
  await pagina.waitForURL(`${base}/`, { timeout: 10000 });
  assert.equal(estado.dialogos.length, 2, "ya guardado no se pregunta");
  assert.deepEqual(fallos, []);
  await contexto.close();
});

/* Contraste del claro en las vistas que el delta de tokens remapea: cada
   texto visible con texto propio contra su fondo efectivo. 4.5:1, o 3:1 para
   texto grande (24 px, o 18.66 px en negrita). */
async function textosBajoContraste(pagina) {
  return pagina.evaluate(() => {
    const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0]; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
    const mezclar = (a, b) => [0, 1, 2].map((k) => a[k] * a[3] + b[k] * (1 - a[3])).concat(1);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const fondo = (n) => { const capas = []; for (let x = n; x; x = x.parentElement) { const c = rgba(getComputedStyle(x).backgroundColor); if (c[3] > 0) { capas.push(c); if (c[3] >= 1) break; } } let b = [255, 255, 255, 1]; for (const c of capas.reverse()) b = mezclar(c, b); return b; };
    const malos = new Map();
    for (const n of document.querySelectorAll("body *")) {
      if (!n.closest("#portada, #estimador, .bc-barra")) continue;
      const propio = [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!propio) continue;
      const r = n.getBoundingClientRect(); const st = getComputedStyle(n);
      if (!r.width || !r.height || st.visibility === "hidden" || st.opacity === "0") continue;
      if (n.closest("[disabled], .doc, .hoja, iframe")) continue;
      // En SVG el color del texto es `fill`, no `color` (review nativa H1).
      const tinta = n instanceof SVGElement ? st.fill : st.color;
      const bg = fondo(n); const c = mezclar(rgba(tinta), bg);
      const [x, y] = [lum(c), lum(bg)].sort((a, b) => b - a); const ratio = (x + 0.05) / (y + 0.05);
      const px = parseFloat(st.fontSize); const grande = px >= 24 || (px >= 18.66 && Number(st.fontWeight) >= 700);
      if (ratio < (grande ? 3 : 4.5)) {
        const cls = typeof n.className === "string" ? n.className : n.getAttribute("class") || "";
        const clave = (cls.trim() ? "." + cls.trim().split(/\s+/).join(".") : n.tagName.toLowerCase()) + " " + tinta;
        if (!malos.has(clave)) malos.set(clave, { que: clave, ratio: Math.round(ratio * 100) / 100, texto: n.textContent.trim().slice(0, 30) });
      }
    }
    return [...malos.values()];
  });
}

test("claro: contraste de texto 4.5:1 (3:1 grande) en la portada y en las pestañas del proyecto sintético", async () => {
  const { pagina, contexto, fallos } = await abrir({ colorScheme: "light" });
  const hallazgos = (await textosBajoContraste(pagina)).map((h) => ({ vista: "portada", ...h }));
  await pagina.locator(`[data-abrir="${PROYECTO.id}"]`).click();
  await pagina.locator("#v_nom").waitFor({ state: "visible", timeout: 20000 });
  for (const ws of ["capex", "opex"]) {
    await pagina.click(`#wsNav [data-ws="${ws}"]`);
    const pestanas = ws === "capex" ? await pagina.locator("#tabsCapex .tab").evaluateAll((ns) => ns.map((n) => n.dataset.t)) : [null];
    for (const t of pestanas) {
      if (t) await pagina.click(`#tabsCapex [data-t="${t}"]`);
      await pagina.waitForTimeout(150);
      hallazgos.push(...(await textosBajoContraste(pagina)).map((h) => ({ vista: ws + (t ? ":" + t : ""), ...h })));
      if (t === "dist") {
        // El barrido tiene que ver el texto de las gráficas: si no hay texto
        // SVG medido, la prueba no prueba lo que dice (review nativa H1).
        const svg = await pagina.evaluate(() => [...document.querySelectorAll("#p-dist svg text")]
          .filter((n) => n.getBoundingClientRect().width > 0).map((n) => [n.getAttribute("class") || "", getComputedStyle(n).fill]));
        if (process.env.DEPURAR_SVG) console.log("# svg dist: " + JSON.stringify([...new Set(svg.map((x) => x.join(" ")))]));
        if (process.env.CAPTURAS) await pagina.locator("#p-dist").screenshot({ path: `${process.env.CAPTURAS}/ec-distribucion-claro.png` });
        assert.ok(svg.length > 10, "no se midió el texto de las gráficas de Distribución");
      }
    }
  }
  console.log("# hallazgos de contraste en claro: " + JSON.stringify(hallazgos));
  assert.deepEqual(hallazgos, []);
  assert.deepEqual(fallos, []);
  await contexto.close();
});

test("carrera del autoguardado: un guardado A que termina después de la edición B no la da por guardada; el regreso avisa", async () => {
  const { pagina, contexto, estado, fallos } = await abrir();
  await pagina.locator(`[data-abrir="${PROYECTO.id}"]`).click();
  await pagina.locator("#v_nom").waitFor({ state: "visible", timeout: 20000 });
  estado.retenerEscrituras = true;
  await pagina.fill("#v_nom", "Edición A");
  await pagina.locator("#v_nom").dispatchEvent("input");
  for (let i = 0; i < 60 && !estado.retenidas.length; i++) await pagina.waitForTimeout(50);
  assert.equal(estado.retenidas.length, 1, "el guardado A no llegó a la red");
  // Edición B mientras A está en vuelo; su autoguardado queda esperando 700 ms.
  await pagina.fill("#v_nom", "Edición B");
  await pagina.locator("#v_nom").dispatchEvent("input");
  estado.retenerEscrituras = false;
  estado.retenidas.splice(0).forEach((soltar) => soltar());
  await pagina.waitForTimeout(100);   // A resolvió; B todavía no se envía
  await pagina.click(".bc-volver");
  await pagina.waitForTimeout(200);
  assert.equal(estado.dialogos.length, 1, "con la edición B sin guardar no se avisó");
  assert.equal(await pagina.inputValue("#v_nom"), "Edición B");
  assert.doesNotMatch(await pagina.locator(".dirty").first().innerText(), /^Guardado/, "no debe decir «Guardado» con B pendiente");
  await pagina.locator(".dirty", { hasText: /Guardado/ }).first().waitFor({ timeout: 5000 });
  await pagina.click(".bc-volver");
  await pagina.waitForURL(`${base}/`, { timeout: 10000 });
  assert.equal(estado.dialogos.length, 1);
  assert.deepEqual(fallos, []);
  await contexto.close();
});

test("ruta «Proyectos» enlazada en el proyecto vuelve a la portada; «Todos los proyectos» no se duplica bajo Platform", async () => {
  const { pagina, contexto, fallos } = await abrir();
  await pagina.locator(`[data-abrir="${PROYECTO.id}"]`).click();
  await pagina.locator("#v_nom").waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await pagina.locator("#b_volver").isVisible(), false, "botón duplicado visible");
  const enlace = pagina.locator(".bc-ruta a", { hasText: "Proyectos" });
  assert.equal(await enlace.getAttribute("href"), "/ec/");
  await enlace.click();
  await pagina.locator(`[data-abrir="${PROYECTO.id}"]`).waitFor({ state: "visible", timeout: 10000 });
  assert.match(pagina.url(), /\/ec\/$/);
  assert.equal(await textoRuta(pagina), "Proyectos");
  assert.deepEqual(fallos, []);
  await contexto.close();
});
