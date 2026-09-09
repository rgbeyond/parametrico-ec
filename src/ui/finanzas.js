/* Interfaz de la sección Finanzas (issue #7).
   ===========================================

   QUÉ HACE ESTE ARCHIVO Y QUÉ NO
   ------------------------------
   Pinta. Ni una operación aritmética vive aquí: los totales de OPEX, las
   participaciones, la brecha de fondeo y el snapshot de la vista salen de
   `src/lib/finanzas/*`, que son funciones puras y se prueban en Node sin
   navegador. Si en este archivo apareciera una suma, habría dos motores
   financieros y algún día darían cifras distintas.

   EL CAPEX NO SE CAPTURA Y NO SE RECALCULA
   ----------------------------------------
   Llega como argumento desde `app.js`, que lo toma de `totals()` —el mismo
   resultado que pinta el presupuesto y que alimenta la exportación—. En esta
   pantalla no hay ningún campo donde escribirlo: es una cifra derivada y así
   se muestra.

   POR QUÉ LA TABLA NO SE RECONSTRUYE EN CADA TECLA
   ------------------------------------------------
   `app.js` llama a `render()` en cada cambio, y `render()` llama a `pintar()`.
   Si esto rehiciera el `innerHTML` de la tabla en cada pulsación, el campo
   perdería el foco y el cursor a media captura —el mismo problema que ya
   resolvió el perfil mensual del fotovoltaico—. Así que la tabla se rehace
   sólo cuando cambia el CONJUNTO de renglones (su firma de identificadores) y
   el resto de las veces sólo se actualizan las celdas derivadas, nunca el
   campo que tiene el foco.
*/

import { finanzasNueva, renglonOpexNuevo, inversionistaNuevo } from "../lib/finanzas/estado.js";
import { CATEGORIAS_OPEX, resumenOpex } from "../lib/finanzas/opex.js";
import { resumenInversionistas } from "../lib/finanzas/inversionistas.js";
import { snapshotInversionista } from "../lib/finanzas/snapshot.js";
import { vistaInversionistaHTML } from "../lib/finanzas/vista.js";
import { finanzasDemo } from "../lib/finanzas/demo.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-MX")}`;
const pct = (x) => `${(Number(x || 0) * 100).toFixed(2)}%`;
const esc = (s) => String(s ?? "").replace(/[<>&"]/g,
  (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const clon = (x) => JSON.parse(JSON.stringify(x));
const texto = (id, v) => { const el = $(id); if (el) el.textContent = v; };

const PANELES = ["res", "opex", "inv", "vista"];

export function montarFinanzas({ alCambiar }) {
  let actual = null;          // el estado de finanzas tal cual, o null si no hay
  let ultimo = null;          // los últimos datos con que se pintó
  let firmaOpex = null;
  let firmaInv = null;
  let panel = "res";

  /* Toda edición pasa por aquí. Si el proyecto todavía no tenía finanzas, la
     estructura se crea EN ESTE MOMENTO —no al abrir—, que es lo que hace que
     abrir un proyecto viejo no le escriba nada. */
  const editar = (fn) => {
    const base = actual ? clon(actual) : finanzasNueva();
    fn(base);
    actual = base;
    alCambiar(base);
  };

  $$("#finNav [data-fin]").forEach((b) => b.addEventListener("click", () => {
    panel = b.dataset.fin;
    aplicaPanel();
    if (ultimo) pintar(ultimo);
  }));

  function aplicaPanel() {
    $$("#finNav [data-fin]").forEach((b) => b.setAttribute("aria-selected",
      String(b.dataset.fin === panel)));
    PANELES.forEach((p) => $("#fin-" + p).classList.toggle("hide", p !== panel));
  }

  $("#fin_add_opex").addEventListener("click", () => {
    editar((f) => f.opex.push(renglonOpexNuevo({ categoria: "Otros" })));
  });
  $("#fin_add_inv").addEventListener("click", () => {
    editar((f) => f.inversionistas.push(inversionistaNuevo({})));
  });
  $("#fin_notas").addEventListener("input", (e) => {
    const v = e.target.value;
    editar((f) => { f.notas = v; });
  });
  $$("[data-fin-demo]").forEach((b) => b.addEventListener("click", () => {
    actual = finanzasDemo();
    alCambiar(clon(actual));
  }));
  $("#fin_quita_demo").addEventListener("click", () => {
    editar((f) => { delete f.demo; });
  });

  /* --- tabla de OPEX ------------------------------------------------------ */
  function filasOpex(lista) {
    const cats = CATEGORIAS_OPEX.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    $("#fin_opex_body").innerHTML = lista.map((r) => `<tr data-id="${esc(r.id)}">
      <td><input type="text" data-campo="concepto" placeholder="Describe el gasto"></td>
      <td><select data-campo="categoria">${cats}</select></td>
      <td class="num"><input type="number" class="money" data-campo="monto" min="0" step="100"></td>
      <td class="num" data-anual></td>
      <td style="text-align:center"><input type="checkbox" data-campo="activo"></td>
      <td><button class="xbtn" data-borrar title="Quitar este concepto">×</button></td>
    </tr>`).join("");
    enlazaFilas("#fin_opex_body", "opex");
  }

  function filasInv(lista) {
    $("#fin_inv_body").innerHTML = lista.map((r) => `<tr data-id="${esc(r.id)}">
      <td><input type="text" data-campo="nombre" placeholder="Nombre o razón social"></td>
      <td class="num"><input type="number" class="money" data-campo="aportacion" min="0" step="10000"></td>
      <td class="num" data-part></td>
      <td style="text-align:center"><input type="checkbox" data-campo="activo"></td>
      <td><button class="xbtn" data-borrar title="Quitar este inversionista">×</button></td>
    </tr>`).join("");
    enlazaFilas("#fin_inv_body", "inversionistas");
  }

  function enlazaFilas(sel, coleccion) {
    $$(`${sel} tr`).forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelectorAll("[data-campo]").forEach((el) => {
        const campo = el.dataset.campo;
        const evento = el.type === "checkbox" ? "change" : "input";
        el.addEventListener(evento, () => {
          const v = el.type === "checkbox" ? el.checked
            : (el.type === "number" ? (parseFloat(el.value) || 0) : el.value);
          editar((f) => {
            const x = f[coleccion].find((y) => y.id === id);
            if (x) x[campo] = v;
          });
        });
      });
      tr.querySelector("[data-borrar]").addEventListener("click", () => {
        editar((f) => { f[coleccion] = f[coleccion].filter((y) => y.id !== id); });
      });
    });
  }

  /* Sincroniza valores sin tocar el campo que tiene el foco. Es la parte que
     permite escribir un monto sin que la cifra salte mientras se teclea. */
  function sincroniza(sel, lista) {
    $$(`${sel} tr`).forEach((tr) => {
      const r = lista.find((x) => x.id === tr.dataset.id);
      if (!r) return;
      tr.querySelectorAll("[data-campo]").forEach((el) => {
        if (document.activeElement === el) return;
        const v = r[el.dataset.campo];
        if (el.type === "checkbox") el.checked = v !== false;
        else el.value = v ?? "";
      });
    });
  }

  /* --- pintado ------------------------------------------------------------ */
  function pintar(datos) {
    ultimo = datos;
    actual = datos.finanzas || null;
    const f = actual || { opex: [], inversionistas: [], notas: "" };
    const o = resumenOpex(f.opex);
    const inv = resumenInversionistas(f.inversionistas, datos.capex);

    const demo = !!f.demo;
    /* En la vista de inversionista el aviso no se repite: esa hoja lleva el
       suyo dentro, que es donde tiene que ir. */
    $("#fin_demo").classList.toggle("hide", !demo || panel === "vista");

    // Resumen
    texto("#fin_capex", pesos(datos.capex));
    texto("#fin_capex_x", datos.clase || "");
    texto("#fin_opex_mes", pesos(o.mensual));
    texto("#fin_opex_mes_x", o.activos
      ? `${o.activos} concepto${o.activos === 1 ? "" : "s"} activo${o.activos === 1 ? "" : "s"}`
      : "Sin conceptos capturados");
    texto("#fin_opex_anio", pesos(o.anual));
    texto("#fin_aportado", pesos(inv.aportado));
    texto("#fin_aportado_x", datos.capex > 0
      ? `Cubre ${pct(inv.cobertura)} de la inversión total` : "");
    const brechaEl = $("#fin_brecha");
    if (inv.faltante > 0) {
      texto("#fin_brecha_lb", "Falta por fondear");
      brechaEl.textContent = pesos(inv.faltante);
      brechaEl.style.color = "var(--warning)";
      texto("#fin_brecha_x", "Capital por conseguir para cubrir la inversión total");
    } else if (inv.excedente > 0) {
      texto("#fin_brecha_lb", "Excedente de fondeo");
      brechaEl.textContent = pesos(inv.excedente);
      brechaEl.style.color = "var(--accent-2)";
      texto("#fin_brecha_x", "El capital aportado supera la inversión total");
    } else {
      texto("#fin_brecha_lb", "Brecha de fondeo");
      brechaEl.textContent = inv.aportado > 0 ? "Cubierta" : "—";
      brechaEl.style.color = inv.aportado > 0 ? "var(--success)" : "";
      texto("#fin_brecha_x", inv.aportado > 0
        ? "El capital aportado cubre la inversión total"
        : "Sin aportaciones capturadas");
    }
    texto("#fin_ninv", String(inv.activos));
    texto("#fin_ninv_x", inv.inactivos
      ? `${inv.inactivos} inactivo${inv.inactivos === 1 ? "" : "s"}, fuera del reparto`
      : "Sólo cuentan los activos");

    // Desglose del CAPEX: son las mismas cifras del presupuesto, sin recalcular.
    $("#fin_capex_desglose").innerHTML = datos.desglose.map((x) => `
      <div class="derived"><span class="muted">${esc(x.rotulo)}</span>
        <b>${pesos(x.valor)}</b></div>`).join("");

    // Distribución de OPEX por categoría.
    $("#fin_opex_cats").innerHTML = o.porCategoria.length
      ? o.porCategoria.map((c) => `
        <div style="margin-bottom:10px">
          <div class="bal" style="margin-bottom:4px"><span class="tiny">${esc(c.categoria)}</span>
            <b class="tiny">${pesos(c.mensual)} · ${pct(c.pct)}</b></div>
          <div class="qbar"><div style="width:${(c.pct * 100).toFixed(1)}%;background:var(--accent)"></div></div>
        </div>`).join("")
      : '<div class="tiny muted">Captura conceptos en la pestaña OPEX para ver el reparto.</div>';

    if ($("#fin_notas") !== document.activeElement) $("#fin_notas").value = f.notas || "";

    // OPEX
    const fOpex = f.opex.map((r) => r.id).join("|");
    if (fOpex !== firmaOpex) { firmaOpex = fOpex; filasOpex(f.opex); }
    sincroniza("#fin_opex_body", f.opex);
    $$("#fin_opex_body tr").forEach((tr) => {
      const r = f.opex.find((x) => x.id === tr.dataset.id);
      const c = tr.querySelector("[data-anual]");
      if (r && c) c.textContent = r.activo === false ? "—" : pesos((+r.monto || 0) * 12);
      tr.style.opacity = r && r.activo === false ? ".45" : "";
    });
    texto("#fin_opex_tot_mes", pesos(o.mensual));
    texto("#fin_opex_tot_anio", pesos(o.anual));
    $("#fin_opex_vacio").classList.toggle("hide", f.opex.length > 0);

    // Inversionistas
    const fInv = f.inversionistas.map((r) => r.id).join("|");
    if (fInv !== firmaInv) { firmaInv = fInv; filasInv(f.inversionistas); }
    sincroniza("#fin_inv_body", f.inversionistas);
    $$("#fin_inv_body tr").forEach((tr) => {
      const r = f.inversionistas.find((x) => x.id === tr.dataset.id);
      const p = inv.participantes.find((x) => x.id === tr.dataset.id);
      const c = tr.querySelector("[data-part]");
      if (c) c.textContent = p ? pct(p.participacion) : "—";
      tr.style.opacity = r && r.activo === false ? ".45" : "";
    });
    texto("#fin_inv_req", pesos(inv.capexRequerido));
    texto("#fin_inv_apo", pesos(inv.aportado));
    texto("#fin_inv_gap", inv.faltante > 0 ? pesos(inv.faltante)
      : (inv.excedente > 0 ? `+${pesos(inv.excedente)}` : "Cubierto"));
    texto("#fin_inv_suma", pct(inv.sumaParticipaciones));
    $("#fin_inv_vacio").classList.toggle("hide", f.inversionistas.length > 0);

    // Vista de inversionista: se arma del snapshot, nunca del estado completo.
    if (panel === "vista") {
      const snap = snapshotInversionista({
        nombre: datos.nombre, ubicacion: datos.ubicacion,
        capexTotal: datos.capex, deposito: datos.deposito,
        clase: datos.clase, precision: datos.precision,
        opex: o,
        fondeo: inv,
        participantes: inv.participantes,
        notas: f.notas || "",
        version: datos.version, fecha: new Date(), demo,
      });
      $("#fin-vista").innerHTML = vistaInversionistaHTML(snap);
    }
  }

  aplicaPanel();
  return { pintar, mostrarPanel: (p) => { panel = p; aplicaPanel(); if (ultimo) pintar(ultimo); } };
}
