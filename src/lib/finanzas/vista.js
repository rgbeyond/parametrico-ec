/* Vista de inversionista: el marcado, a partir del snapshot (issue #7).
   =====================================================================

   ES UNA HOJA, NO UNA PANTALLA DE EDICIÓN
   ---------------------------------------
   Esta función devuelve marcado de sólo lectura: cero `input`, cero `select`,
   cero `button`, cero `textarea`. No es una recomendación de estilo, es la
   condición de la vista y hay una prueba que la comprueba sobre el HTML que
   sale de aquí y otra sobre el DOM ya pintado.

   Se construye del SNAPSHOT, no del estado. Lo que no esté en el snapshot no
   se puede pintar aunque se quiera, que es el punto de tener un snapshot.

   FONDO CLARO A PROPÓSITO
   -----------------------
   La aplicación es oscura porque se usa horas seguidas para capturar. Esta
   hoja es lo contrario: se lee una vez, se enseña en una junta y algún día se
   imprimirá. Usa la clase `.doc`, que es el tema claro que ya existe en la
   aplicación para el documento de propuesta, para no inventar un tercer tema.
*/

const esc = (s) => String(s ?? "").replace(/[<>&"]/g,
  (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

const pesos = (n) => `$${Number(n || 0).toLocaleString("es-MX")}`;
const pct = (x) => `${(Number(x || 0) * 100).toFixed(2)}%`;

const cifra = (rotulo, valor, pie = "", color = "") => `
  <div style="flex:1 1 190px;min-width:170px">
    <div class="eyebrow">${esc(rotulo)}</div>
    <div style="font-size:27px;font-weight:300;letter-spacing:-.02em;margin-top:6px${
  color ? `;color:${color}` : ""}">${esc(valor)}</div>
    ${pie ? `<div style="font-size:11px;color:#5A5A57;margin-top:4px">${esc(pie)}</div>` : ""}
  </div>`;

/* Proyección de operación, por AÑO. La serie mensual se queda del lado
   interno: quien pone capital necesita la trayectoria, no ciento veinte
   renglones con sesiones, demanda facturable y costo unitario de energía. */
function operacionHTML(s) {
  const anios = s.operacion || [];
  if (!anios.length) return "";
  return `<div style="margin-top:26px;padding-top:18px;border-top:1px solid rgba(0,0,0,.1)">
    <div class="eyebrow">Proyección de operación</div>
    <div style="overflow-x:auto"><table style="margin-top:10px;min-width:520px">
      <thead><tr><th>Año</th><th class="num">Ventas</th>
        <th class="num">Costo de electricidad</th><th class="num">Operación</th>
        <th class="num">EBITDA</th><th class="num">Margen</th></tr></thead>
      <tbody>${anios.map((a) => `<tr>
        <td>${esc(a.anio)}</td>
        <td class="num">${pesos(a.ventas)}</td>
        <td class="num">${pesos(a.costoEnergia)}</td>
        <td class="num">${pesos(a.opex)}</td>
        <td class="num" style="font-weight:600">${pesos(a.ebitda)}</td>
        <td class="num">${pct(a.margen)}</td></tr>`).join("")}
      </tbody></table></div>
    <div style="font-size:11px;color:#5A5A57;margin-top:8px">
      EBITDA antes de intereses, impuestos y depreciación, sobre supuestos de
      operación capturados para este proyecto. No hay ingresos históricos: es
      una proyección, no un resultado.</div>
  </div>`;
}

export function vistaInversionistaHTML(snap) {
  if (!snap) return "";
  const s = snap;
  const brecha = s.fondeo.faltante > 0
    ? cifra("Falta por fondear", pesos(s.fondeo.faltante),
      `Cubierto ${pct(s.fondeo.cobertura)} de la inversión total`, "#B4590C")
    : cifra(s.fondeo.excedente > 0 ? "Excedente de fondeo" : "Fondeo",
      s.fondeo.excedente > 0 ? pesos(s.fondeo.excedente) : "Completo",
      s.fondeo.excedente > 0
        ? `El capital aportado supera la inversión total en ${pct(s.fondeo.cobertura - 1)}`
        : "El capital aportado cubre la inversión total");

  const filas = s.inversionistas.length
    ? s.inversionistas.map((p) => `<tr>
        <td>${esc(p.nombre)}</td>
        <td class="num">${pesos(p.aportacion)}</td>
        <td class="num">${pct(p.participacion)}</td></tr>`).join("")
    : `<tr><td colspan="3" style="color:#5A5A57">Sin inversionistas capturados.</td></tr>`;
  const sumaAport = s.inversionistas.reduce((a, p) => a + p.aportacion, 0);
  const sumaPart = s.inversionistas.reduce((a, p) => a + p.participacion, 0);

  const cats = s.opex.porCategoria.length
    ? `<table style="margin-top:10px"><thead><tr><th>Categoría</th>
        <th class="num">Mensual</th><th class="num">Parte</th></tr></thead><tbody>
        ${s.opex.porCategoria.map((c) => `<tr><td>${esc(c.categoria)}</td>
          <td class="num">${pesos(c.mensual)}</td>
          <td class="num">${pct(c.pct)}</td></tr>`).join("")}
      </tbody></table>`
    : `<div style="color:#5A5A57;font-size:12px;margin-top:10px">
        Sin gasto de operación capturado.</div>`;

  const aviso = s.meta.demo
    ? `<div style="background:#F0EFEC;border-left:2px solid #B4590C;border-radius:0 8px 8px 0;padding:10px 14px;font-size:11.5px;color:#5A5A57;margin-bottom:18px">
        <b style="color:#1A1A1A">Datos de demostración.</b> Las cifras de
        operación y las aportaciones de esta hoja son inventadas para mostrar
        la pantalla y no corresponden a ningún proyecto real.</div>`
    : "";

  return `<div class="doc" id="fin-hoja">
    ${aviso}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap;border-bottom:1px solid rgba(0,0,0,.2);padding-bottom:16px">
      <div>
        <div class="eyebrow">BEYOND AE · INFRAESTRUCTURA DE CARGA</div>
        <h3 style="margin-top:8px;font-size:24px">${esc(s.proyecto.nombre)}</h3>
        ${s.proyecto.ubicacion
    ? `<div style="color:#5A5A57;font-size:13px;margin-top:3px">${esc(s.proyecto.ubicacion)}</div>`
    : ""}
      </div>
      <div style="text-align:right;font-size:11px;color:#5A5A57;line-height:1.7">
        <div class="eyebrow">Resumen para inversionista</div>
        <div>${esc(s.meta.fechaTxt)}</div>
        <div>${esc(s.meta.version)}</div>
      </div>
    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:20px">
      ${cifra("Inversión total (CAPEX)", pesos(s.capex.total),
    s.capex.clase || "", "#B4590C")}
      ${cifra("Capital aportado", pesos(s.fondeo.aportado),
    `${s.inversionistas.length} ${s.inversionistas.length === 1
      ? "participante" : "participantes"}`)}
      ${brecha}
    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:22px;padding-top:18px;border-top:1px solid rgba(0,0,0,.1)">
      ${cifra("Operación mensual (OPEX)", pesos(s.opex.mensual))}
      ${cifra("Operación anual", pesos(s.opex.anual))}
      ${s.capex.deposito > 0
    ? cifra("Depósito en garantía", pesos(s.capex.deposito),
      "Reembolsable, fuera del costo de obra")
    : ""}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:26px;margin-top:26px">
      <div>
        <div class="eyebrow">Participación por aportación</div>
        <table style="margin-top:10px"><thead><tr><th>Inversionista</th>
          <th class="num">Aportación</th><th class="num">Participación</th></tr></thead>
          <tbody>${filas}
            <tr><td style="font-weight:600;border-bottom:0">Total</td>
              <td class="num" style="font-weight:600;border-bottom:0">${pesos(sumaAport)}</td>
              <td class="num" style="font-weight:600;border-bottom:0">${pct(sumaPart)}</td></tr>
          </tbody></table>
        <div style="font-size:11px;color:#5A5A57;margin-top:8px">
          La participación es la proporción del capital aportado. No es una
          tabla accionaria: la estructura societaria la define el acta
          constitutiva y el acuerdo de socios.</div>
      </div>
      <div>
        <div class="eyebrow">Gasto de operación por categoría</div>
        ${cats}
      </div>
    </div>

    ${operacionHTML(s)}

    ${s.notas ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(0,0,0,.1)">
      <div class="eyebrow">Notas y supuestos</div>
      <div style="font-size:12.5px;margin-top:8px;white-space:pre-wrap">${esc(s.notas)}</div>
    </div>` : ""}

    <div style="margin-top:24px;padding-top:14px;border-top:1px solid rgba(0,0,0,.14);font-size:11px;color:#5A5A57;line-height:1.7">
      <b style="color:#1A1A1A">Estimado paramétrico, no precio cerrado.</b>
      ${s.capex.precision
    ? `El rango esperado de la inversión es ${esc(s.capex.precision)} sobre la cifra mostrada.`
    : ""}
      El gasto de operación son supuestos capturados para este proyecto, sin
      facturación ni histórico real. No incluye ingresos, retorno, impuestos ni
      financiamiento: esas cifras no están modeladas todavía.
      <div style="margin-top:6px">${esc(s.meta.fechaTxt)} · ${esc(s.meta.version)}</div>
    </div>
  </div>`;
}
