/* Exportación del catálogo/BOM del proyecto abierto (issue #4).
   =============================================================

   QUÉ NO HACE ESTE ARCHIVO, Y ES LO IMPORTANTE
   --------------------------------------------
   No calcula nada. Recibe los MISMOS `rows` que `build()` dejó y los MISMOS
   totales que devolvió `totals()` —los que la pantalla ya pintó— y sólo les da
   forma de archivo. No hay aquí una segunda ruta de cálculo, ni una consulta
   paralela, ni una regla de cantidades: si la pantalla dice 47 renglones por
   $36,370,522, el archivo dice eso, porque es literalmente el mismo arreglo.

   Un export que recalculara por su cuenta acabaría, el día que alguien toque
   una fórmula, entregando al cliente una cifra distinta a la que el proyectista
   revisó en pantalla. Ese es el defecto que este diseño impide por construcción.

   LOS NÚMEROS SE REDONDEAN COMO EN PANTALLA
   -----------------------------------------
   `mx()` imprime importes al peso y `money()` precios a dos decimales. Aquí se
   aplica el MISMO redondeo, sin símbolo ni separadores de miles: el archivo
   tiene que traer el número que el proyectista vio, no una versión con más
   precisión que la que revisó.

   POR QUÉ NO IMPORTA NADA
   -----------------------
   Las pruebas corren en Node sin transpilar, así que un módulo que quiera ser
   probable no puede importar JSON, Supabase ni `import.meta.env`. Las tablas de
   nombres (categorías, taxonomía, unidades) se INYECTAN desde `app.js`, que es
   donde viven: duplicarlas aquí crearía dos vocabularios que se separan.
*/

// Las mismas palabras de la pantalla, en el mismo orden, más dos que el archivo
// necesita y la tabla no: `Categoría` —que en pantalla es el renglón de grupo—
// y `Tratamiento`, sin la cual la suma de la columna Importe no cuadra con el
// subtotal (el depósito en garantía viaja en la lista y no es costo de obra).
export const COLUMNAS = ["Código", "Categoría", "Concepto", "Unidad",
  "Cantidad", "Precio unitario", "Importe", "Sustento", "Tratamiento",
  "Base del número"];

// Las mismas palabras que usa la app para el tratamiento de cada renglón.
export const TRATO = {
  capex: "Costo de obra",
  pass: "Pass-through",
  dep: "Garantía reembolsable",
};

const redCant = (q) => Math.round((+q || 0) * 100) / 100;   // como el input
const redPU = (p) => Math.round((+p || 0) * 100) / 100;     // como money()
const redImp = (i) => Math.round(+i || 0);                  // como mx()

/* El modelo intermedio que consumen las DOS salidas y las pruebas. Es la única
   estructura que hay entre el motor y los archivos. */
export function modeloExport({ rows, t, cfg, catn = {}, taxn = {}, uab = (u) => u,
  versionTxt = "", ahora = new Date() } = {}) {
  if (!rows || !t) throw new Error("Sin renglones ni totales no hay nada que exportar");
  /* SÓLO LOS ACTIVOS, Y SON LOS DE `t.on`.
     La tabla de pantalla pinta también los inactivos, atenuados al 42%, y
     además puede venir filtrada por categoría o por búsqueda. Ninguna de las
     dos cosas define el presupuesto: `t.on` —los renglones con cantidad mayor
     que cero— es el conjunto con el que la app calcula sus totales, así que es
     el que se exporta. Un archivo que respetara el filtro de pantalla se
     leería como el BOM del proyecto siendo un subconjunto. */
  const renglones = t.on.map((r) => ({
    codigo: r.c,
    categoria: catn[r.cat] || r.cat,
    concepto: r.d,
    unidad: uab(r.u),
    cantidad: redCant(r.q),
    pu: redPU(r.pu),
    importe: redImp(r.imp),
    sustento: taxn[r.tax] || r.tax,
    trato: TRATO[r.tr] || TRATO.capex,
    base: r.r || "",
    editado: !!(r.eq || r.ep || r.et),
  }));
  /* Los totales son los que la app ya muestra, con SUS etiquetas. Copiarlas
     literales es a propósito: si mañana cambia una, tiene que cambiar en un
     solo sitio y no aparecer distinta en el archivo. */
  const totales = [
    { concepto: "Subtotal de obra y equipo", importe: redImp(t.tec) },
  ];
  if (t.fee) {
    totales.push({ concepto: "Indirectos y administración de proyecto",
      importe: redImp(t.fee) });
  }
  if (t.cont) {
    totales.push({ concepto: `Reserva de contingencia (${cfg.cont}%)`,
      importe: redImp(t.cont) });
  }
  totales.push({ concepto: "Inversión total, más IVA", importe: redImp(t.total) });
  // Reembolsable: se reporta APARTE del total, como en el documento.
  const aparte = t.dep
    ? [{ concepto: "Depósito en garantía ante el suministrador",
      importe: redImp(t.dep),
      nota: "Garantía reembolsable, no costo de obra. El monto lo determina "
        + "el suministrador." }]
    : [];
  return {
    proyecto: { nombre: cfg.nom || "Sin nombre", ubicacion: cfg.loc || "" },
    meta: {
      exportado: ahora.toISOString(),
      exportadoTxt: ahora.toLocaleString("es-MX", { dateStyle: "long",
        timeStyle: "short" }),
      version: versionTxt,
      clase: t.cl ? `Clase ${t.cl.c} — ${t.cl.nom}` : "",
      precision: t.cl ? `${t.cl.lo}% / +${t.cl.hi}%` : "",
      indice: t.idd != null ? Math.round(t.idd * 100) / 100 : null,
      activos: t.on.length,
      totalRenglones: rows.length,
    },
    renglones, totales, aparte,
  };
}

/* CSV
   ---
   UTF-8 con BOM y fin de línea CRLF: es lo que Excel espera para no romper
   acentos ni la ñ. El separador es la coma y los decimales el punto, que es la
   convención de es-MX; en una configuración regional que use `;` como separador
   de lista el archivo abriría en una sola columna, y eso queda dicho en el
   handoff en vez de resolverse con una línea `sep=` que ensucia el archivo para
   todo lo demás.

   Los números van crudos, sin `$` ni separador de miles, para que Excel los
   sume sin tener que limpiarlos. */
const BOM = "\uFEFF";

export function campoCSV(v) {
  if (v == null) return "";
  const s = String(v);
  // Comilla doble duplicada y campo entrecomillado: RFC 4180. La `Base del
  // número` trae comas, comillas y a veces saltos, así que esto no es teórico.
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function aCSV(modelo) {
  const l = [];
  const fila = (xs) => l.push(xs.map(campoCSV).join(","));
  fila(["Proyecto", modelo.proyecto.nombre]);
  fila(["Ubicación", modelo.proyecto.ubicacion]);
  fila(["Exportado", modelo.meta.exportadoTxt]);
  fila(["Versión de la aplicación", modelo.meta.version]);
  if (modelo.meta.clase) fila(["Nivel de definición", modelo.meta.clase]);
  if (modelo.meta.precision) fila(["Precisión esperada", modelo.meta.precision]);
  fila(["Renglones activos", modelo.meta.activos]);
  l.push("");
  fila(COLUMNAS);
  for (const r of modelo.renglones) {
    fila([r.codigo, r.categoria, r.concepto, r.unidad, r.cantidad, r.pu,
      r.importe, r.sustento, r.trato, r.base]);
  }
  l.push("");
  for (const x of modelo.totales) fila([x.concepto, "", "", "", "", "", x.importe]);
  for (const x of modelo.aparte) {
    fila([x.concepto, "", "", "", "", "", x.importe, "", TRATO.dep, x.nota]);
  }
  return BOM + l.join("\r\n") + "\r\n";
}

/* El mismo tratamiento de nombre que ya usa la descarga de la propuesta:
   sin acentos, sin signos y en minúsculas. */
export function slug(nombre) {
  return String(nombre || "catalogo").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").toLowerCase() || "catalogo";
}

export function nombreArchivo(nombre, fecha, ext) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const iso = Number.isNaN(d.getTime())
    ? "sin-fecha"
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
      String(d.getDate()).padStart(2, "0")}`;
  return `catalogo-${slug(nombre)}-${iso}.${ext}`;
}

/* DOCUMENTO IMPRIMIBLE
   -------------------
   Misma estrategia que la propuesta, que ya existía en esta app: un documento
   HTML propio, con logo y tipografías incrustados, que se manda al diálogo de
   impresión del navegador para «Guardar como PDF». No entra ninguna
   dependencia: una biblioteca de PDF pesa más que todo el estimador.

   Se construye del MODELO, no del DOM: así no puede arrastrar un `input`, un
   `select` ni un botón de la pantalla de edición, que es lo que RG no quiere
   ver en el documento.

   La paginación la hace el navegador. `thead` se repite en cada página por
   omisión, y `break-inside:avoid` en cada fila impide que un renglón se corte
   por la mitad. */
const escH = (s) => String(s ?? "").replace(/[<>&]/g,
  (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const pesos = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;

export function documentoHTML(modelo, { fuentes = "", logo = "" } = {}) {
  const css = `${fuentes}
@page{size:letter;margin:14mm 12mm}
*{box-sizing:border-box}
body{margin:0;background:#fff;color:#333330;font-family:Montserrat,system-ui,Arial,sans-serif;font-size:11px;line-height:1.45}
.sheet{padding:0}
h3{font-size:19px;margin:0;color:#1A1A1A;letter-spacing:-.02em}
.eyebrow{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#5A5A57;font-weight:600}
.enc{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid rgba(0,0,0,.26);padding-bottom:12px;margin-bottom:14px}
.meta{font-size:10px;color:#5A5A57;text-align:right;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:9.5px}
thead{display:table-header-group}
th{text-align:left;color:#5A5A57;border-bottom:1px solid rgba(0,0,0,.26);padding:5px 4px;font-size:8.5px;letter-spacing:.05em;text-transform:uppercase}
td{border-bottom:1px solid rgba(0,0,0,.1);padding:5px 4px;vertical-align:top}
tr{break-inside:avoid;page-break-inside:avoid}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cat td{background:#F0EFEC;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
.tot td{border-bottom:0;padding-top:7px;font-size:10.5px}
.tot .fin{font-weight:700;color:#B4590C;font-size:12px}
.pie{margin-top:14px;font-size:9px;color:#5A5A57;border-top:1px solid rgba(0,0,0,.14);padding-top:8px}
@media print{.noprint{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
img{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.noprint{background:#F0EFEC;border-radius:8px;padding:9px 13px;font-size:10px;color:#5A5A57;margin-bottom:12px}`;
  // Agrupado por categoría, como la tabla de pantalla: un renglón de grupo con
  // su subtotal y debajo sus partidas. El subtotal por grupo se suma de los
  // importes que ya vienen en el modelo; no es un total nuevo, es el mismo
  // renglón de grupo que la pantalla ya muestra.
  const grupos = [];
  for (const r of modelo.renglones) {
    let g = grupos.find((x) => x.cat === r.categoria);
    if (!g) { g = { cat: r.categoria, items: [], st: 0 }; grupos.push(g); }
    g.items.push(r); g.st += r.importe;
  }
  const filas = grupos.map((g) => `
    <tr class="cat"><td colspan="5">${escH(g.cat)}</td>
      <td class="num">${pesos(g.st)}</td><td colspan="2"></td></tr>
    ${g.items.map((r) => `<tr>
      <td>${escH(r.codigo)}</td><td>${escH(r.concepto)}</td>
      <td>${escH(r.unidad)}</td><td class="num">${r.cantidad}</td>
      <td class="num">${pesos(r.pu)}</td><td class="num">${pesos(r.importe)}</td>
      <td>${escH(r.sustento)}</td><td>${escH(r.trato)}</td></tr>`).join("")}`)
    .join("");
  const ultimo = modelo.totales.length - 1;
  const totales = modelo.totales.map((x, i) => `<tr class="tot">
      <td colspan="5">${i === ultimo
    ? `<b>${escH(x.concepto)}</b>` : escH(x.concepto)}</td>
      <td class="num ${i === ultimo ? "fin" : ""}">${pesos(x.importe)}</td>
      <td colspan="2"></td></tr>`).join("");
  const aparte = modelo.aparte.map((x) => `<div class="pie">
      <b>${escH(x.concepto)}: ${pesos(x.importe)}.</b> ${escH(x.nota)}</div>`)
    .join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${escH(modelo.proyecto.nombre)} — catálogo de conceptos — Beyond</title>
<style>${css}</style></head><body><div class="sheet">
<div class="noprint">Documento listo para imprimir. Usa Imprimir del navegador
y elige Guardar como PDF, tamaño Carta. Este aviso no aparece en la impresión.</div>
<div class="enc">
  <div>${logo
    ? `<img src="${logo}" alt="Beyond" style="display:block;width:118px;height:40px;object-fit:contain">`
    : ""}
    <div class="eyebrow" style="margin-top:6px">BEYOND AE · INFRAESTRUCTURA DE CARGA</div>
    <h3 style="margin-top:8px">Catálogo de conceptos del proyecto</h3></div>
  <div class="meta"><div class="eyebrow">Proyecto</div>
    <div style="font-weight:600;color:#333330;font-size:11px">${escH(modelo.proyecto.nombre)}</div>
    ${modelo.proyecto.ubicacion ? `<div>${escH(modelo.proyecto.ubicacion)}</div>` : ""}
    <div>${escH(modelo.meta.exportadoTxt)}</div>
    <div>${escH(modelo.meta.version)}</div>
    ${modelo.meta.clase ? `<div>${escH(modelo.meta.clase)}</div>` : ""}
    ${modelo.meta.precision ? `<div>Precisión esperada ${escH(modelo.meta.precision)}</div>` : ""}
  </div></div>
<table><colgroup><col style="width:8%"><col style="width:33%"><col style="width:5%">
  <col style="width:7%"><col style="width:11%"><col style="width:12%">
  <col style="width:12%"><col style="width:12%"></colgroup>
<thead><tr><th>Código</th><th>Concepto</th><th>Un.</th><th class="num">Cant.</th>
  <th class="num">P.U.</th><th class="num">Importe</th>
  <th>Sustento</th><th>Tratamiento</th></tr></thead>
<tbody>${filas}${totales}</tbody></table>
${aparte}
<div class="pie">${escH(modelo.meta.activos)} renglones activos de
${escH(modelo.meta.totalRenglones)} en el catálogo del proyecto. Las cifras
salen del mismo cálculo que la pantalla del proyecto, en la versión indicada
arriba; no constituyen un precio cerrado.</div>
</div></body></html>`;
}
