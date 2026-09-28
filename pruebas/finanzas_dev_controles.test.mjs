import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("DEV financiero expone los tres botones solicitados y la franquicia", async()=>{
  const h=await readFile(new URL("../index.html",import.meta.url),"utf8");
  for(const id of ["fin_opex_csv","fin_pdf_inversionista","fin_pdf_escenarios","f_franquiciaActiva","f_franquiciaPct","fin_franquicia"]) assert.match(h,new RegExp('id="'+id+'"'));
});
