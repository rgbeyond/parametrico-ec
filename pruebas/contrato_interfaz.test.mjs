// Las copias del contrato de interfaz común (beyond-ui-contract/v1) y del
// módulo de sesión (beyond-session-contract/v1) son las de Core, byte por
// byte salvo la cabecera de procedencia. Si alguien la edita
// aquí, esta prueba falla: el cambio se hace en Platform y se vuelve a copiar
// (rgbeyond/beyond-platform, docs/arquitectura/contrato-interfaz-v1.md §8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONTRATO_UI } from "../src/lib/contrato/interfaz-v1.mjs";
import { PREFIJOS_APPS, validarVolver } from "../src/lib/contrato/sesion-v1.mjs";

// Cada archivo con el commit de Core del que se copió. sesion-v1 entra en
// SD-01 (/sd/ en la lista de volver).
const HUELLAS = {
  "interfaz-v1.mjs": ["d04141a", "096c0848b36af83169a1b7603b38bf4f81c9b54ca173e8a165039f9027acf6d0"],
  "interfaz-v1.css": ["d04141a", "00b6120156d4b9d5225cc943ba9e139f842835276508e2dad7f6d4bcd0128b4d"],
  "sesion-v1.mjs": ["0fa48fc", "e7c76a4af98e00de0b8bafca31e0c9798b73ea09b03c91f425b0c6f10572a964"],
};

test("las copias de los contratos son las de Core", () => {
  assert.equal(CONTRATO_UI, "beyond-ui-contract/v1");
  for (const [archivo, [ORIGEN, huella]] of Object.entries(HUELLAS)) {
    const texto = readFileSync(new URL("../src/lib/contrato/" + archivo, import.meta.url), "utf8");
    const lineas = texto.split("\n");
    assert.match(lineas[0], new RegExp("COPIA de rgbeyond/beyond-platform:plataforma/contrato/" + archivo.replace(".", "\\.") + " \\(claude/ui-01-comun @ " + ORIGEN + "\\)"));
    const cuerpo = lineas.slice(2).join("\n");
    assert.equal(createHash("sha256").update(cuerpo).digest("hex"), huella, archivo + " difiere de Core");
  }
});

test("OM-01: /om/ está en la copia del contrato y es retorno válido", () => {
  assert.equal(PREFIJOS_APPS.om, "/om/");
  assert.equal(validarVolver("/om/#/i/inst-01"), "/om/#/i/inst-01");
});

test("MO-01: /mo/ está en la copia del contrato y es retorno válido", () => {
  assert.equal(PREFIJOS_APPS.mo, "/mo/");
  assert.equal(validarVolver("/mo/"), "/mo/");
});

test("CLUB-01: /club/ está en la copia del contrato y es retorno válido", () => {
  assert.equal(PREFIJOS_APPS.club, "/club/");
  assert.equal(validarVolver("/club/"), "/club/");
});
