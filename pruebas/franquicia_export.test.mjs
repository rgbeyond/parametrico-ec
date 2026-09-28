import { test } from "node:test";
import assert from "node:assert/strict";
import { ctrlNuevo } from "../src/lib/finanzas/estado.js";
import { proyectar, agregar, resumenPorAnioOperacion } from "../src/lib/finanzas/proyeccion.js";
import { csvOpexAno1 } from "../src/lib/finanzas/exportar.js";

const base={inicio:"2026-09",precioKwh:10,uptime:100,perdidas:0,sesionesIni:0,rampaMeses:0,crecSesiones:0};
const esc={sesiones:10,kwhSesion:10,dmax:1000};
test("franquicia apagada no descuenta",()=>{const s=proyectar({ctrl:ctrlNuevo({...base,franquiciaActiva:false}),escenario:esc,meses:12});assert.equal(s[0].costoFranquicia,0);});
test("franquicia 15% se calcula sobre ventas brutas una sola vez",()=>{const s=proyectar({ctrl:ctrlNuevo({...base,franquiciaActiva:true,franquiciaPct:15}),escenario:esc,meses:12});assert.equal(Math.round(s[0].costoFranquicia),Math.round(s[0].ventas*.15));assert.equal(Math.round(s[0].ebitda),Math.round(s[0].ventas-s[0].costoFranquicia));});
test("Año 1 operativo cruza septiembre-agosto",()=>{const s=proyectar({ctrl:ctrlNuevo(base),escenario:esc,meses:24});const a=resumenPorAnioOperacion(s);assert.equal(a[0].inicio,"Sep 2026");assert.equal(a[0].fin,"Ago 2027");assert.equal(a[0].meses,12);});
test("CSV Año 1 contiene exactamente septiembre a agosto y total",()=>{const s=proyectar({ctrl:ctrlNuevo(base),escenario:esc,meses:12});const csv=csvOpexAno1({serie:s,nombre:"Ecatepec"});assert.match(csv,/Sep 2026/);assert.match(csv,/Ago 2027/);assert.match(csv,/TOTAL AÑO 1/);assert.equal((csv.match(/\r\n/g)||[]).length>12,true);});
test("agregado conserva franquicia",()=>{const s=proyectar({ctrl:ctrlNuevo({...base,franquiciaActiva:true,franquiciaPct:15}),escenario:esc,meses:12});const g=agregar(s);assert.equal(Math.round(g.costoFranquicia),Math.round(g.ventas*.15));});
