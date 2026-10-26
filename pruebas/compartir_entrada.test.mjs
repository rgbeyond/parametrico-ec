// Entrada «Compartir» (Compartir C2): la URL hacia Core y su regreso.
// Solo navegación; no hay datos del estudio en juego.
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlCompartir } from "../src/lib/compartir_entrada.js";

const ID = "0b6c8a1e-0000-4000-8000-000000000001";

test("estudio PV y EV con su regreso a la app", () => {
  assert.equal(urlCompartir("pv", ID, `/energia/#/fv/${ID}`), `/compartir/pv/${ID}?volver=${encodeURIComponent(`/energia/#/fv/${ID}`)}`);
  assert.equal(urlCompartir("ev", ID.toUpperCase(), "/ec/"), `/compartir/ev/${ID}?volver=%2Fec%2F`);
  // Core decodifica el parámetro: el regreso llega como ruta propia, sin
  // separadores codificados que su contrato rechazaría.
  const u = new URL(urlCompartir("pv", ID, `/energia/#/fv/${ID}`), "https://origen.invalid");
  assert.equal(u.searchParams.get("volver"), `/energia/#/fv/${ID}`);
  assert.equal(u.pathname, `/compartir/pv/${ID}`);
});

test("sin estudio válido no hay enlace; un regreso que no es ruta propia se omite", () => {
  for (const [t, id] of [["pv", "local-123"], ["ev", ""], ["bs", ID], ["pv", null], ["PV", ID]]) assert.equal(urlCompartir(t, id, "/x/"), null, `${t} ${id}`);
  assert.equal(urlCompartir("pv", ID, "https://evil.example/"), `/compartir/pv/${ID}`);
  assert.equal(urlCompartir("pv", ID, null), `/compartir/pv/${ID}`);
});

// Las dos apps llevan el MISMO archivo (Energía y EV). Si una copia cambia,
// esta huella falla en esa app y se actualiza en las dos y en el contrato de
// Core (docs/operacion/shield-01/compartir-c2-contrato.md §4).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
test("compartir_entrada.js es la copia común (huella)", () => {
  const h = createHash("sha256").update(readFileSync(new URL("../src/lib/compartir_entrada.js", import.meta.url))).digest("hex");
  assert.equal(h, "ead5f1831cd7352a306ec9265f9d2791def8a7f7332811f7f73d9da518c15236");
});
