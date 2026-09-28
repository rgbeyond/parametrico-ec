/* Salidas financieras de sólo lectura: CSV Año 1 y documentos imprimibles. */
import { montoEnMes } from "./opex.js";
import { vistaInversionistaHTML } from "./vista.js";

const BOM="\uFEFF";
const esc=(s)=>String(s??"").replace(/[<>&"]/g,(c)=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c]));
const pesos=(n)=>"$"+Math.round(Number(n)||0).toLocaleString("es-MX");
export const slug=(s)=>String(s||"proyecto").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"proyecto";
const campo=(v)=>{ if(v==null)return ""; if(typeof v==="number")return Number.isFinite(v)?String(v):""; const s=String(v); const seguro=/^[=+\-@\t\r]/.test(s)?"'"+s:s; return /[",\r\n;]/.test(seguro)?'"'+seguro.replace(/"/g,'""')+'"':seguro; };
const fila=(xs)=>xs.map(campo).join(",");

export function csvOpexAno1({serie=[],opex=[],ipc=0,nombre=""}={}) {
  const meses=(serie||[]).slice(0,12);
  if(meses.length!==12) throw new Error("La proyección no contiene los 12 meses del Año 1.");
  const l=[];
  l.push(fila(["Proyecto",nombre]));
  l.push(fila(["Periodo","Primeros 12 meses de operación"]));
  l.push("");
  l.push(fila(["Mes operativo","Periodo","Ventas","Costo de electricidad","Franquicia","Otros costos variables","OPEX fijo","Egresos operativos","EBITDA"]));
  meses.forEach((x,i)=>l.push(fila([i+1,x.etiqueta,Math.round(x.ventas),Math.round(x.costoElectricidad),Math.round(x.costoFranquicia||0),Math.round(x.costoVariable),Math.round(x.opexFijo),Math.round(x.egresos),Math.round(x.ebitda)])));
  const suma=(k)=>Math.round(meses.reduce((a,x)=>a+(Number(x[k])||0),0));
  l.push(fila(["TOTAL AÑO 1","",suma("ventas"),suma("costoElectricidad"),suma("costoFranquicia"),suma("costoVariable"),suma("opexFijo"),suma("egresos"),suma("ebitda")]));
  l.push("");
  l.push(fila(["DETALLE OPEX FIJO","Categoría","Concepto"].concat(meses.map(x=>x.etiqueta),["Total Año 1"])));
  for(const r of (opex||[]).filter(x=>x&&x.activo!==false)){
    const vals=meses.map((x,i)=>Math.round(montoEnMes(r,i,ipc)));
    l.push(fila(["OPEX",r.categoria||"",r.concepto||""].concat(vals,[vals.reduce((a,b)=>a+b,0)])));
  }
  return BOM+l.join("\r\n")+"\r\n";
}
export function nombreCsvAno1(nombre){return "opex-ano-1-"+slug(nombre)+".csv";}

const cssDoc=`
@page{size:letter;margin:14mm 12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#333330;font-family:Arial,sans-serif;font-size:11px;line-height:1.45}.sheet{padding:0}.doc{background:#fff;color:#333330}.eyebrow{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#5A5A57;font-weight:700}h3{color:#1A1A1A}table{width:100%;border-collapse:collapse}th{text-align:left;color:#5A5A57;border-bottom:1px solid #aaa;padding:6px 5px;font-size:9px;text-transform:uppercase}td{border-bottom:1px solid #ddd;padding:6px 5px}.num{text-align:right;white-space:nowrap}.warn{border-left:3px solid #B4590C;padding:9px 12px;background:#F6F1EC;margin:12px 0}.page{break-before:page}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.card{border:1px solid #ddd;border-radius:8px;padding:10px}.big{font-size:20px;font-weight:700}.muted{color:#666}.noprint{background:#eee;padding:8px 10px;border-radius:7px;margin-bottom:12px}@media print{.noprint{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export function documentoInversionistaHTML(snapshot){
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(snapshot?.proyecto?.nombre||"Inversionistas")+' — inversionistas — Beyond</title><style>'+cssDoc+'</style></head><body><div class="sheet"><div class="noprint">Usa Imprimir y elige Guardar como PDF, tamaño Carta.</div>'+vistaInversionistaHTML(snapshot)+'</div></body></html>';
}

export function documentoEscenariosHTML({nombre="",ubicacion="",escenarios=[],version=""}={}){
  const cards=escenarios.map((e)=>'<div class="card"><div class="eyebrow">'+esc(e.nombre)+'</div>'+(e.disponible?'<div class="big">'+pesos(e.resumen.ventas)+'</div><div class="muted">Ventas Año 1</div><div style="margin-top:8px">EBITDA <b>'+pesos(e.resumen.ebitda)+'</b></div>':'<div class="muted" style="margin-top:10px">Sin datos suficientes</div>')+'</div>').join("");
  const filas=escenarios.map((e)=>'<tr><td><b>'+esc(e.nombre)+'</b></td><td class="num">'+(e.disponible?Math.round(e.sesiones):"—")+'</td><td class="num">'+(e.disponible?Math.round(e.kwhSesion):"—")+'</td><td class="num">'+(e.disponible?Math.round(e.dmax):"—")+'</td><td class="num">'+(e.disponible?pesos(e.resumen.ventas):"—")+'</td><td class="num">'+(e.disponible?pesos(e.resumen.costoElectricidad):"—")+'</td><td class="num">'+(e.disponible?pesos(e.resumen.costoFranquicia||0):"—")+'</td><td class="num">'+(e.disponible?pesos(e.resumen.costoVariable):"—")+'</td><td class="num">'+(e.disponible?pesos(e.resumen.opexFijo):"—")+'</td><td class="num">'+(e.disponible?pesos(e.resumen.ebitda):"—")+'</td><td class="num">'+(e.disponible?(Number(e.resumen.margen||0)*100).toFixed(1)+"%":"—")+'</td></tr>').join("");
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+esc(nombre)+' — 3 escenarios — Beyond</title><style>'+cssDoc+'</style></head><body><div class="sheet"><div class="noprint">Usa Imprimir y elige Guardar como PDF, tamaño Carta.</div><div class="eyebrow">BEYOND AE · INFRAESTRUCTURA DE CARGA</div><h2>'+esc(nombre)+'</h2><div class="muted">'+esc(ubicacion)+(version?' · '+esc(version):'')+'</div><h3>Comparativo de 3 escenarios — Año 1 operativo</h3><div class="cards">'+cards+'</div><div class="warn"><b>Proyección preliminar.</b> El costo de electricidad queda pendiente de validación del tratamiento de demanda y generación fotovoltaica. No es un resultado bancable.</div><table><thead><tr><th>Escenario</th><th class="num">Ses/día</th><th class="num">kWh/ses</th><th class="num">Dmax kW</th><th class="num">Ventas</th><th class="num">Electricidad</th><th class="num">Franquicia</th><th class="num">Otros variables</th><th class="num">OPEX fijo</th><th class="num">EBITDA</th><th class="num">Margen</th></tr></thead><tbody>'+filas+'</tbody></table></div></body></html>';
}

export function descargarTexto(nombre,contenido,tipo="text/csv;charset=utf-8"){
  const blob=new Blob([contenido],{type:tipo}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
}
export function abrirDialogoImpresion(html){
  return new Promise((resolve,reject)=>{
    const f=document.createElement("iframe"); f.setAttribute("aria-hidden","true"); f.style.cssText="position:fixed;left:-10000px;top:0;width:216mm;height:279mm;border:0;opacity:0";
    let hecho=false; const limpiar=()=>{if(f.isConnected)f.remove();};
    f.addEventListener("load",()=>{ if(hecho||!f.contentWindow)return; let u=""; try{u=f.contentWindow.location.href;}catch{} if(u==="about:blank")return; hecho=true; const w=f.contentWindow; w.addEventListener("afterprint",limpiar,{once:true}); setTimeout(limpiar,120000); try{w.focus();w.print();resolve();}catch(e){limpiar();reject(e);} });
    f.srcdoc=html; document.body.appendChild(f);
  });
}
