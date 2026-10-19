// La copia del contrato de interfaz común (beyond-ui-contract/v1) es la de
// Core, byte por byte salvo la cabecera de procedencia. Si alguien la edita
// aquí, esta prueba falla: el cambio se hace en Platform y se vuelve a copiar
// (rgbeyond/beyond-platform, docs/arquitectura/contrato-interfaz-v1.md §8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONTRATO_UI } from "../src/lib/contrato/interfaz-v1.mjs";

const ORIGEN = "5f4ba5b";
const HUELLAS = {
  "interfaz-v1.mjs": "ae85f91cb233999a7a348892accb78a92fd24f07b0eec028d03573e1976fc82e",
  "interfaz-v1.css": "d6438a2dca9de2de2f413d0737c0a756c1408bf1fe6cac6bbbdd7284827bfb17",
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
