// La copia del contrato de interfaz común (beyond-ui-contract/v1) es la de
// Core, byte por byte salvo la cabecera de procedencia. Si alguien la edita
// aquí, esta prueba falla: el cambio se hace en Platform y se vuelve a copiar
// (rgbeyond/beyond-platform, docs/arquitectura/contrato-interfaz-v1.md §8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONTRATO_UI } from "../src/lib/contrato/interfaz-v1.mjs";

const ORIGEN = "d04141a";
const HUELLAS = {
  "interfaz-v1.mjs": "096c0848b36af83169a1b7603b38bf4f81c9b54ca173e8a165039f9027acf6d0",
  "interfaz-v1.css": "00b6120156d4b9d5225cc943ba9e139f842835276508e2dad7f6d4bcd0128b4d",
};

test("la copia del contrato de interfaz es la de Core @ " + ORIGEN, () => {
  assert.equal(CONTRATO_UI, "beyond-ui-contract/v1");
  for (const [archivo, huella] of Object.entries(HUELLAS)) {
    const texto = readFileSync(new URL("../src/lib/contrato/" + archivo, import.meta.url), "utf8");
    const lineas = texto.split("\n");
    assert.match(lineas[0], new RegExp("COPIA de rgbeyond/beyond-platform:plataforma/contrato/" + archivo.replace(".", "\\.") + " \\(claude/ui-01-comun @ " + ORIGEN + "\\)"));
    const cuerpo = lineas.slice(2).join("\n");
    assert.equal(createHash("sha256").update(cuerpo).digest("hex"), huella, archivo + " difiere de Core");
  }
});
