/* Interfaz del workspace OPEX / Operación (issue #7).
   ===================================================

   QUÉ HACE ESTE ARCHIVO Y QUÉ NO
   ------------------------------
   Pinta. Ni una operación aritmética del modelo vive aquí: los totales de
   OPEX, las participaciones, la brecha de fondeo y la serie mensual completa
   salen de `src/lib/finanzas/*`, que son funciones puras y se prueban en Node
   sin navegador. Si en este archivo apareciera una fórmula del negocio,
   habría dos motores financieros y algún día darían cifras distintas.

   EL CAPEX NO SE CAPTURA Y NO SE RECALCULA
   ----------------------------------------
   Llega como argumento desde `app.js`, que lo toma de `totals()` —el mismo
   resultado que pinta el presupuesto y que alimenta la exportación—. En estas
   pantallas no hay ningún campo donde escribirlo.

   MODO DEMOSTRACIÓN: TEMPORAL Y NO PERSISTENTE
   --------------------------------------------
   El modelo de referencia se carga en una copia que vive SÓLO en esta
   pantalla. Mientras está activo, editar no llama a `alCambiar`, así que el
   proyecto no se marca sucio y no se guarda nada. Convertirlo en datos del
   proyecto es un segundo paso explícito, con confirmación.

   POR QUÉ LAS TABLAS NO SE RECONSTRUYEN EN CADA TECLA
   ---------------------------------------------------
   `app.js` llama a `render()` en cada cambio, y `render()` llama a `pintar()`.
   Si esto rehiciera el `innerHTML` de una tabla en cada pulsación, el campo
   perdería el foco y el cursor a media captura. Las tablas se rehacen sólo
   cuando cambia su FIRMA —el conjunto de renglones, y para el OPEX también el
   modo de incremento, que cambia qué control lleva la celda de tasa—; el
   resto de las veces sólo se actualizan las celdas derivadas.
*/

import { finanzasNueva, renglonOpexNuevo, inversionistaNuevo, variableNuevo,
  MODOS_INCREMENTO } from "../lib/finanzas/estado.js";
import { CATEGORIAS_OPEX, resumenOpex, resumenVariables,
  tasaEfectiva } from "../lib/finanzas/opex.js";
import { opexDePlantilla } from "../lib/finanzas/plantilla.js";
import { resumenInversionistas } from "../lib/finanzas/inversionistas.js";
import { snapshotInversionista } from "../lib/finanzas/snapshot.js";
import { vistaInversionistaHTML } from "../lib/finanzas/vista.js";
import { finanzasDemo, ESCENARIO_DEMO } from "../lib/finanzas/demo.js";
import { proyectar, agregar, aniosDeSerie, resumenPorAnioOperacion,
  MESES_NOMBRE } from "../lib/finanzas/proyeccion.js";
import { crearPublicacion, ordenadas, ultimaPublicacion, contratoConocido,
  hayCambiosSinPublicar } from "../lib/finanzas/publicacion.js";
import { csvOpexAno1, nombreCsvAno1, documentoInversionistaHTML,
  documentoEscenariosHTML, descargarTexto, abrirDialogoImpresion } from "../lib/finanzas/exportar.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-MX")}`;
const pct = (x) => `${(Number(x || 0) * 100).toFixed(2)}%`;
const pctDir = (x) => `${(Number(x) || 0).toFixed(2)}%`;
const dec = (x, d = 1) => (Number(x) || 0).toLocaleString("es-MX",
  { minimumFractionDigits: d, maximumFractionDigits: d });
const ent = (x) => Math.round(Number(x) || 0).toLocaleString("es-MX");
const esc = (s) => String(s ?? "").replace(/[<>&"]/g,
  (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const clon = (x) => JSON.parse(JSON.stringify(x));
const texto = (id, v) => { const el = $(id); if (el) el.textContent = v; };

const PANELES = ["res", "ctrl", "opex", "proy", "inv", "vista"];

/* Los supuestos: id del campo, llave en `ctrl` y cómo leerlo. */
const CAMPOS_CTRL = [
  ["#f_inicio", "inicio", "txt"],
  ["#f_horizonte", "horizonte", "num"],
  ["#f_ipc", "ipc", "num"],
  ["#f_escenario", "escenario", "num"],
  ["#f_precioKwh", "precioKwh", "num"],
  ["#f_precioPromo", "precioPromo", "num"],
  ["#f_mesesPromo", "mesesPromo", "num"],
  ["#f_incPrecio", "incPrecio", "num"],
  ["#f_uptime", "uptime", "num"],
  ["#f_perdidas", "perdidas", "num"],
  ["#f_sesionesIni", "sesionesIni", "num"],
  ["#f_rampaMeses", "rampaMeses", "num"],
  ["#f_crecSesiones", "crecSesiones", "num"],
  ["#f_incCFE", "incCFE", "num"],
  ["#f_incMEM", "incMEM", "num"],
  ["#f_ahorroMem", "ahorroMem", "num"],
  ["#f_franquiciaActiva", "franquiciaActiva", "bool"],
  ["#f_franquiciaPct", "franquiciaPct", "num"],
  ["#f_cambioMem", "cambioMem", "txt"],
];

/* Los renglones de la proyección. Cada uno sabe pintarse desde un mes y desde
   el agregado anual, que NO es la suma en los renglones unitarios: el precio
   promedio del año es ventas entre kWh, no el promedio de doce precios. */
const RENGLONES_PROY = [
  { t: "Sesiones por día", m: (x) => dec(x.sesionesDia, 1), a: (g) => dec(g.sesionesDia, 1) },
  { t: "kWh por sesión", m: (x) => dec(x.kwhSesion, 1), a: (g, s) => dec(s[0]?.kwhSesion, 1) },
  { t: "Uptime", m: (x) => pctDir(x.uptime), a: (g, s) => pctDir(s[0]?.uptime) },
  { t: "Castigo por techo de potencia (kWh/día)", m: (x) => ent(x.castigoKwhDia),
    a: (g, s) => ent(s.length ? g.castigoKwhDia / s.length : 0) },
  { t: "kWh vendidos por día", m: (x) => ent(x.kwhDia), a: (g, s) => ent(s.length ? g.kwhMes / s.length / 30.4 : 0) },
  { t: "kWh vendidos en el mes", m: (x) => ent(x.kwhMes), a: (g) => ent(g.kwhMes), sep: 1 },
  { t: "Precio de venta ($/kWh)", m: (x) => dec(x.precio, 2) + (x.promo ? " ·p" : ""), a: (g) => dec(g.precio, 2) },
  { t: "Ventas", m: (x) => pesos(x.ventas), a: (g) => pesos(g.ventas), fuerte: 1 },
  { t: "Suministrador", m: (x) => x.suministrador, a: (g, s) => [...new Set(s.map((x) => x.suministrador))].join(" / "), sep: 1 },
  { t: "Costo de energía ($/kWh)", m: (x) => dec(x.costoKwh, 4), a: (g) => dec(g.costoKwh, 4) },
  { t: "Pérdidas eléctricas (kWh)", m: (x) => ent(x.kwhPerdido), a: (g) => ent(g.kwhPerdido) },
  { t: "Generación fotovoltaica usada (kWh)", m: (x) => ent(x.generacion), a: (g) => ent(g.generacion) },
  { t: "Excedente fotovoltaico no acreditado (kWh)", m: (x) => ent(x.excedenteFV), a: (g) => ent(g.excedenteFV) },
  { t: "Energía comprada (kWh)", m: (x) => ent(x.kwhComprado), a: (g) => ent(g.kwhComprado) },
  { t: "Costo de la energía", m: (x) => pesos(x.costoEnergia), a: (g) => pesos(g.costoEnergia) },
  { t: "Cargos de demanda y fijos", m: (x) => pesos(x.cargosDemanda), a: (g) => pesos(g.cargosDemanda) },
  { t: "Costo de electricidad", m: (x) => pesos(x.costoElectricidad), a: (g) => pesos(g.costoElectricidad) },
  { t: "Utilidad bruta", m: (x) => pesos(x.utilidadBruta), a: (g) => pesos(g.utilidadBruta), fuerte: 1, sep: 1 },
  { t: "Costos variables sobre ventas", m: (x) => pesos(x.costoVariable), a: (g) => pesos(g.costoVariable) },
  { t: "Franquicia", m: (x) => pesos(x.costoFranquicia), a: (g) => pesos(g.costoFranquicia) },
  { t: "OPEX fijo", m: (x) => pesos(x.opexFijo), a: (g) => pesos(g.opexFijo) },
  { t: "Egresos totales", m: (x) => pesos(x.egresos), a: (g) => pesos(g.egresos) },
  { t: "EBITDA", m: (x) => pesos(x.ebitda), a: (g) => pesos(g.ebitda), fuerte: 1, sep: 1 },
  { t: "Margen EBITDA", m: (x) => pct(x.margen), a: (g) => pct(g.margen) },
];

export function montarFinanzas({ alCambiar }) {
  let actual = null;      // el estado del proyecto, o null si no tiene finanzas
  let demo = null;        // copia temporal del modelo de referencia
  let ultimo = null;      // los últimos datos con que se pintó
  let firmaOpex = null;
  let firmaVar = null;
  let firmaInv = null;
  let panel = "res";
  let anioSel = null;
  /* `null` = la hoja en vivo, que se recalcula. Un id = una versión
     congelada, que ya no se mueve aunque el proyecto cambie. */
  let pubSel = null;
  let pubMsg = "";
  let ultimaSerie = [];
  let hojaActual = null;

  const vigente = () => demo || actual
    || { ctrl: finanzasNueva().ctrl, opex: [], variables: [], inversionistas: [], notas: "" };

  /* Toda edición pasa por aquí. En modo demostración se queda en memoria; si
     no, se crea la estructura EN ESTE MOMENTO —no al abrir— y se avisa a
     `app.js`, que la marca sucia con el mecanismo normal de guardado. */
  const editar = (fn) => {
    if (demo) { fn(demo); if (ultimo) pintar(ultimo); return; }
    const base = actual ? clon(actual) : finanzasNueva();
    fn(base);
    actual = base;
    alCambiar(base);
  };

  // --- navegación ---------------------------------------------------------
  $$("#finNav [data-fin]").forEach((b) => b.addEventListener("click", () => {
    panel = b.dataset.fin;
    aplicaPanel();
    if (ultimo) pintar(ultimo);
  }));

  function aplicaPanel() {
    $$("#finNav [data-fin]").forEach((b) => b.setAttribute("aria-selected",
      String(b.dataset.fin === panel)));
    PANELES.forEach((p) => $("#fin-" + p).classList.toggle("hide", p !== panel));
    /* La barra de publicación acompaña a la hoja, pero vive fuera de ella:
       la hoja no puede tener controles dentro. */
    $("#fin-pub").classList.toggle("hide", panel !== "vista");
  }

  // --- modo demostración --------------------------------------------------
  $("#fin_demo_on").addEventListener("click", () => {
    demo = finanzasDemo();
    if (ultimo) pintar(ultimo);
  });
  $("#fin_demo_off").addEventListener("click", () => {
    demo = null;
    if (ultimo) pintar(ultimo);
  });
  $("#fin_demo_guardar").addEventListener("click", () => {
    if (!demo) return;
    const ok = window.confirm("Vas a copiar los datos de demostración al "
      + "proyecto. Son cifras inventadas: quedarán guardadas y sustituirán lo "
      + "que tenga capturado hoy en Finanzas. ¿Continuar?");
    if (!ok) return;
    const copia = clon(demo);
    demo = null;
    actual = copia;
    alCambiar(copia);
  });

  // --- publicación de la hoja ---------------------------------------------
  /* El último snapshot en vivo que se pintó. Publicar congela EXACTAMENTE lo
     que se está viendo, no una recomposición hecha en otro momento. */
  let snapVivo = null;

  $("#fin_pub_sel").addEventListener("input", (e) => {
    pubSel = e.target.value || null;
    pubMsg = "";
    if (ultimo) pintar(ultimo);
  });

  $("#fin_pub_btn").addEventListener("click", () => {
    const f = vigente();
    if (demo) {
      pubMsg = "No se publica en modo demostración: esas cifras son inventadas. "
        + "Sal del modo demostración o conviértelas en datos del proyecto.";
      if (ultimo) pintar(ultimo);
      return;
    }
    if (ultimo && ultimo.puedeEditar === false) {
      pubMsg = "Tu rol es de consulta: puedes ver las versiones publicadas, "
        + "pero no publicar una nueva.";
      if (ultimo) pintar(ultimo);
      return;
    }
    if (!snapVivo) return;
    const pub = crearPublicacion({
      snapshot: snapVivo,
      etiqueta: $("#fin_pub_etq").value,
      version: ultimo ? ultimo.version : "",
      escenario: f.ctrl?.escenario,
      fecha: new Date(),
    });
    editar((x) => { x.publicaciones = [pub, ...(x.publicaciones || [])]; });
    pubSel = pub.id;
    $("#fin_pub_etq").value = "";
    pubMsg = "Versión publicada. Queda congelada: el proyecto puede seguir "
      + "cambiando sin que esta hoja se mueva.";
    if (ultimo) pintar(ultimo);
  });

  $("#fin_pub_borrar").addEventListener("click", () => {
    if (!pubSel) return;
    const ok = window.confirm("Vas a eliminar esta versión publicada. Si ya se "
      + "enseñó, dejará de haber registro de qué cifras se enseñaron. ¿Continuar?");
    if (!ok) return;
    const id = pubSel;
    pubSel = null;
    editar((x) => {
      x.publicaciones = (x.publicaciones || []).filter((p) => p.id !== id);
    });
    pubMsg = "Versión eliminada.";
    if (ultimo) pintar(ultimo);
  });

  // --- altas --------------------------------------------------------------
  $("#fin_add_opex").addEventListener("click", () => {
    editar((f) => f.opex.push(renglonOpexNuevo({ categoria: "Otros" })));
  });
  $("#fin_plantilla").addEventListener("click", () => {
    editar((f) => { f.opex = [...f.opex, ...opexDePlantilla()]; });
  });
  $("#fin_add_var").addEventListener("click", () => {
    editar((f) => f.variables.push(variableNuevo({})));
  });
  $("#fin_add_inv").addEventListener("click", () => {
    editar((f) => f.inversionistas.push(inversionistaNuevo({})));
  });
  $("#fin_notas").addEventListener("input", (e) => {
    const v = e.target.value;
    editar((f) => { f.notas = v; });
  });

  $("#fin_opex_csv").addEventListener("click", () => {
    const f = vigente(); const msg = $("#fin_opex_export_msg");
    try {
      if (!f.ctrl?.inicio) throw new Error("Captura la fecha de inicio de operación para descargar el primer año.");
      const contenido = csvOpexAno1({ serie: ultimaSerie, opex: f.opex,
        ipc: f.ctrl.ipc || 0, nombre: ultimo?.nombre || "proyecto" });
      const nombre = nombreCsvAno1(ultimo?.nombre || "proyecto");
      descargarTexto(nombre, contenido); msg.textContent = "Descargado " + nombre;
    } catch (err) { msg.textContent = String(err?.message || err); }
  });

  $("#fin_pdf_inversionista").addEventListener("click", async () => {
    if (!hojaActual) return;
    const b=$("#fin_pdf_inversionista"), rot=b.textContent; b.disabled=true; b.textContent="Preparando…";
    try { await abrirDialogoImpresion(documentoInversionistaHTML(hojaActual));
      pubMsg="En el diálogo de impresión elige Guardar como PDF, tamaño Carta.";
    } catch(err){ pubMsg=String(err?.message||err); }
    b.disabled=false; b.textContent=rot; if(ultimo) pintar(ultimo);
  });

  $("#fin_pdf_escenarios").addEventListener("click", async () => {
    const f=vigente(), msg=$("#fin_proy_export_msg");
    const escenarios=(ultimo?.escenarios||[]).slice(0,3).map((e)=>{
      const disponible=!!(e?.sesiones>0 && e?.kwhSesion>0);
      if(!disponible) return {nombre:e?.nombre||"Escenario",disponible:false};
      const s=proyectar({ctrl:f.ctrl,opex:f.opex,variables:f.variables,escenario:e,
        tarifa:ultimo.tarifa,memInicial:ultimo.memInicial,generacion:ultimo.generacion,
        potDiseno:ultimo.potDiseno,meses:12});
      return {nombre:e.nombre,disponible:true,sesiones:e.sesiones,kwhSesion:e.kwhSesion,
        dmax:e.dmax,resumen:agregar(s)};
    });
    const b=$("#fin_pdf_escenarios"), rot=b.textContent; b.disabled=true; b.textContent="Preparando…";
    try { await abrirDialogoImpresion(documentoEscenariosHTML({nombre:ultimo?.nombre||"Proyecto",
      ubicacion:ultimo?.ubicacion||"",escenarios,version:ultimo?.version||""}));
      msg.textContent="En el diálogo de impresión elige Guardar como PDF, tamaño Carta.";
    } catch(err){msg.textContent=String(err?.message||err);}
    b.disabled=false;b.textContent=rot;
  });

  // --- supuestos ----------------------------------------------------------
  for (const [sel, llave, tipo] of CAMPOS_CTRL) {
    $(sel).addEventListener("input", (e) => {
      const v = tipo === "bool" ? e.target.checked
        : (tipo === "num" ? (parseFloat(e.target.value) || 0) : e.target.value);
      editar((f) => { f.ctrl[llave] = v; });
    });
  }
  /* El selector de escenario de la pantalla de proyección es el mismo dato
     que el de Control general: uno solo, en dos sitios. */
  $("#f_proy_esc").addEventListener("input", (e) => {
    const v = parseInt(e.target.value, 10) || 2;
    editar((f) => { f.ctrl.escenario = v; });
  });
  $("#f_proy_anio").addEventListener("input", (e) => {
    anioSel = parseInt(e.target.value, 10) || null;
    if (ultimo) pintar(ultimo);
  });

  // --- tablas -------------------------------------------------------------
  function filasOpex(lista, ipc) {
    const cats = CATEGORIAS_OPEX.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    const modos = Object.entries(MODOS_INCREMENTO)
      .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    $("#fin_opex_body").innerHTML = lista.map((r) => `<tr data-id="${esc(r.id)}">
      <td><input type="text" data-campo="concepto" placeholder="Describe el gasto"></td>
      <td><select data-campo="categoria">${cats}</select></td>
      <td class="num"><input type="number" class="money" data-campo="monto" min="0" step="100"></td>
      <td><select data-inc>${modos}</select></td>
      <td class="num">${r.inc?.modo === "propia"
    ? '<input type="number" class="money" data-tasa min="0" step="0.1">'
    : `<span data-tasaTxt>${pctDir(tasaEfectiva(r, ipc))}</span>`}</td>
      <td style="text-align:center"><input type="checkbox" data-campo="activo"></td>
      <td><button class="xbtn" data-borrar title="Quitar este concepto">×</button></td>
    </tr>`).join("");
    enlazaFilas("#fin_opex_body", "opex");
    $$("#fin_opex_body tr").forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector("[data-inc]").addEventListener("change", (e) => {
        const modo = e.target.value;
        editar((f) => {
          const x = f.opex.find((y) => y.id === id);
          if (x) x.inc = { ...(x.inc || {}), modo };
        });
      });
      const t = tr.querySelector("[data-tasa]");
      if (t) {
        t.addEventListener("input", () => {
          const tasa = parseFloat(t.value) || 0;
          editar((f) => {
            const x = f.opex.find((y) => y.id === id);
            if (x) x.inc = { ...(x.inc || {}), tasa };
          });
        });
      }
    });
  }

  function filasVar(lista) {
    $("#fin_var_body").innerHTML = lista.map((r) => `<tr data-id="${esc(r.id)}">
      <td><input type="text" data-campo="concepto" placeholder="Comisión, fee de operación…"></td>
      <td class="num"><input type="number" class="money" data-campo="pct" min="0" max="100" step="0.5"></td>
      <td style="text-align:center"><input type="checkbox" data-campo="activo"></td>
      <td><button class="xbtn" data-borrar title="Quitar este costo">×</button></td>
    </tr>`).join("");
    enlazaFilas("#fin_var_body", "variables");
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
      const inc = tr.querySelector("[data-inc]");
      if (inc && document.activeElement !== inc) inc.value = r.inc?.modo || "ipc";
      const t = tr.querySelector("[data-tasa]");
      if (t && document.activeElement !== t) t.value = r.inc?.tasa ?? 0;
    });
  }

  // --- proyección ---------------------------------------------------------
  function pintaProyeccion(datos, f, serie, esc0) {
    const anios = aniosDeSerie(serie);
    if (!anios.includes(anioSel)) anioSel = anios[0] ?? null;
    $("#f_proy_anio").innerHTML = anios
      .map((a) => `<option value="${a}">${a}</option>`).join("");
    if (anioSel != null) $("#f_proy_anio").value = String(anioSel);

    const delAnio = serie.filter((x) => x.anio === anioSel);
    const g = agregar(delAnio);
    /* Los meses del año calendario que la proyección alcanza. El primer año
       casi nunca son doce: una estación que arranca en septiembre tiene
       cuatro, y decir doce sería mentir sobre el periodo. */
    const enc = delAnio.map((x) => MESES_NOMBRE[x.mesNum]);
    const cuerpo = RENGLONES_PROY.map((r) => `<tr class="${r.sep ? "sep " : ""}${r.fuerte ? "fuerte" : ""}">
      <th>${esc(r.t)}</th>
      ${delAnio.map((x) => `<td>${esc(r.m(x))}</td>`).join("")}
      <td class="anual">${esc(r.a(g, delAnio))}</td></tr>`).join("");
    $("#fin_proy_tabla").innerHTML = `<thead><tr><th>Concepto</th>
      ${enc.map((m) => `<th>${m}</th>`).join("")}
      <th class="anual">Año ${anioSel ?? ""}</th></tr></thead><tbody>${cuerpo}</tbody>`;

    // Lo que falta capturar para que la proyección signifique algo.
    const falta = [];
    if (!f.ctrl.inicio) falta.push("la fecha de inicio de operación");
    if (!(f.ctrl.precioKwh > 0)) falta.push("el precio de venta por kWh");
    if (!(esc0.sesiones > 0 && esc0.kwhSesion > 0)) {
      falta.push("las sesiones y los kWh por sesión del escenario seleccionado, que se capturan en Control general");
    }
    if (!(datos.tarifa.costoCFE > 0)) falta.push("los cargos de energía de la tarifa");
    $("#fin_proy_falta").classList.toggle("hide", !falta.length);
    if (falta.length) {
      $("#fin_proy_falta").innerHTML = `<b>Faltan supuestos.</b> La proyección se
        pinta con lo que hay, y hoy falta ${esc(falta.join("; "))}.`;
    }
    const pctVar = resumenVariables(f.variables).pctTotal;
    $("#fin_proy_nota").innerHTML = `<b>Cómo se calcula.</b>
      Ventas = kWh vendidos × precio. kWh vendidos = sesiones/día ×
      kWh por sesión × uptime, con techo físico de
      ${ent(datos.potDiseno)} kW × 24 h al día.
      Energía comprada = vendida ÷ (1 − pérdidas) − generación fotovoltaica.
      Costo de electricidad = energía comprada × costo unitario + cargos de
      capacidad y distribución sobre la demanda facturable + cargo fijo.
      Costos variables = ${dec(pctVar, 2)}% de las ventas.
      EBITDA = utilidad bruta − costos variables − OPEX fijo.
      Todo escala en el <b>aniversario del inicio de operación</b>, no en enero.
      El almacenamiento no despacha en esta serie: donde hay BESS, el costo de
      electricidad proyectado es conservador. La generación sólo desplaza lo que
      la estación consume; el excedente se reporta aparte y <b>no se acredita ni
      se vende</b> en este modelo, y mientras cubra todo el consumo el término
      calculado de la demanda cae a cero y con él los cargos por kW.`;
    return g;
  }

  /* La hoja: en vivo o una versión congelada, y la barra que las gobierna. */
  function pintaPublicacion(datos, f, vivo, enDemo) {
    const pubs = ordenadas(f.publicaciones || []);
    if (pubSel && !pubs.some((p) => p.id === pubSel)) pubSel = null;
    const sel = pubs.find((p) => p.id === pubSel) || null;

    $("#fin_pub_sel").innerHTML = `<option value="">En vivo</option>`
      + pubs.map((p) => `<option value="${esc(p.id)}">${esc(p.publicadoTxt
        || p.publicado)}${p.etiqueta ? ` · ${esc(p.etiqueta)}` : ""}</option>`).join("");
    $("#fin_pub_sel").value = pubSel || "";
    $("#fin_pub_borrar").classList.toggle("hide", !sel);
    /* La liga del portal se arma con el identificador del proyecto abierto, y
       con la versión que se está viendo si es una publicada. Sin proyecto en
       la nube no hay liga que ofrecer. */
    const portal = $("#fin_portal");
    portal.classList.toggle("hide", !datos.proyectoId);
    if (datos.proyectoId) {
      portal.href = `/portal-inversionista.html?proyecto=${encodeURIComponent(datos.proyectoId)}`
        + (sel ? `&version=${encodeURIComponent(sel.id)}` : "");
    }
    $("#fin_pub_btn").disabled = enDemo || datos.puedeEditar === false;

    const cambios = hayCambiosSinPublicar(vivo, pubs);
    const ultima = ultimaPublicacion(pubs);
    texto("#fin_pub_estado", sel
      ? `Viendo una versión congelada del ${sel.publicadoTxt || sel.publicado}`
      : (pubs.length
        ? `Vista en vivo · ${pubs.length} ${pubs.length === 1
          ? "versión publicada" : "versiones publicadas"}`
        : "Vista en vivo · sin versiones publicadas"));

    const msg = $("#fin_pub_msg");
    msg.textContent = pubMsg;
    msg.style.color = pubMsg ? "var(--text-secondary)" : "";

    /* El aviso que evita el error caro: enseñar la hoja en vivo creyendo que
       es la que se mandó, o al revés. */
    let nota;
    if (sel) {
      nota = `<b>Versión congelada.</b> Estas cifras son las que se publicaron
        el ${esc(sel.publicadoTxt || sel.publicado)}${sel.etiqueta
    ? ` con la etiqueta «${esc(sel.etiqueta)}»` : ""}, con
        ${esc(sel.version || "una versión anterior del instrumento")}. No
        cambian aunque el proyecto haya cambiado desde entonces.`;
      if (!contratoConocido(sel)) {
        nota = `<b>Esta versión se publicó con un formato posterior</b>
          (contrato ${esc(sel.contrato)}). Se conserva intacta, pero esta
          versión del instrumento no sabe pintarla completa: ábrela con una
          versión más reciente.`;
      }
    } else if (enDemo) {
      nota = `<b>Modo demostración.</b> La hoja se está pintando con cifras
        inventadas y por eso no se puede publicar.`;
    } else if (cambios) {
      nota = `<b>Hay cambios sin publicar.</b> Lo que ves en vivo ya no
        coincide con la última versión publicada
        (${esc(ultima.publicadoTxt || ultima.publicado)}). Quien tenga la hoja
        publicada está viendo otras cifras.`;
    } else if (ultima) {
      nota = `Lo que ves en vivo coincide con la última versión publicada.`;
    } else {
      nota = `<b>Todavía no se publica ninguna versión.</b> Publicar congela la
        hoja tal como está: sirve para poder volver a enseñar exactamente lo
        mismo, y es lo que un portal de invitados serviría el día que exista.
        Mientras tanto vive dentro del proyecto, así que todavía no hay
        frontera de lectura: quien puede abrir el proyecto puede verla.`;
    }
    $("#fin_pub_nota").innerHTML = nota;

    const hoja = sel && contratoConocido(sel) ? sel.snapshot : (sel ? null : vivo);
    hojaActual = hoja;
    $("#fin-vista").innerHTML = hoja ? vistaInversionistaHTML(hoja) : "";
  }

  // --- pintado ------------------------------------------------------------
  function pintar(datos) {
    ultimo = datos;
    actual = datos.finanzas || null;
    const f = vigente();
    const ipc = f.ctrl?.ipc || 0;
    const o = resumenOpex(f.opex, { mes: 0, ipc });
    const v = resumenVariables(f.variables);
    const inv = resumenInversionistas(f.inversionistas, datos.capex);
    const enDemo = !!demo;

    $("#fin_demo").classList.toggle("hide", !enDemo && !f.demo);
    if (!enDemo && f.demo) {
      texto("#fin_demo_txt", "Estas cifras se copiaron del modelo de "
        + "demostración y ya están guardadas en el proyecto: son inventadas.");
      $("#fin_demo_off").classList.add("hide");
      $("#fin_demo_guardar").classList.add("hide");
    } else {
      texto("#fin_demo_txt", "Estás en modo demostración: estas cifras viven "
        + "sólo en esta pantalla y no se guardan en el proyecto.");
      $("#fin_demo_off").classList.remove("hide");
      $("#fin_demo_guardar").classList.remove("hide");
    }

    // Supuestos
    for (const [sel, llave, tipo] of CAMPOS_CTRL) {
      const el = $(sel);
      if (el && document.activeElement !== el) {
        if (tipo === "bool") el.checked = f.ctrl[llave] === true;
        else el.value = f.ctrl[llave] ?? "";
      }
    }
    $("#f_franquiciaPct").disabled = !f.ctrl.franquiciaActiva;
    const escProyecto = datos.escenarios[(f.ctrl.escenario || 2) - 1] || {};
    /* En modo demostración, y SÓLO si el proyecto no tiene ese escenario
       capturado, se usa el escenario de demostración: los escenarios viven en
       `cfg` y este modo no escribe en `cfg`. Con el proyecto capturado, manda
       el del proyecto. */
    const escDemo = enDemo && !(escProyecto.sesiones > 0);
    const escSel = escDemo ? { ...ESCENARIO_DEMO } : escProyecto;
    texto("#f_h_esc", escSel.sesiones > 0
      ? `${escSel.nombre}: ${dec(escSel.sesiones, 0)} sesiones/día, `
        + `${dec(escSel.kwhSesion, 0)} kWh por sesión, `
        + `${ent(escSel.dmax)} kW de demanda máxima`
        + (escDemo ? " — cifras de demostración, el proyecto no tiene este escenario capturado" : "")
      : "El escenario seleccionado no tiene sesiones capturadas: hazlo en la tabla de abajo.");
    texto("#f_h_sumin", datos.memInicial
      ? "El proyecto declara suministro calificado en el MEM desde Configuración, "
        + "así que la proyección arranca en MEM y la fecha de cambio no se usa."
      : "El proyecto arranca en suministro básico (CFE). Con una fecha de cambio "
        + "capturada, a partir de ese mes el costo unitario pasa a la curva del MEM.");
    texto("#f_h_costo", datos.tarifa.costoCFE > 0
      ? `Se arma del reparto por periodo horario y los cargos de energía capturados `
        + `en la tarjeta de tarifa: ${dec(datos.tarifa.costoCFE, 4)} $/kWh en promedio `
        + `(${datos.tarifa.reparto.punta}% punta, ${datos.tarifa.reparto.interm}% intermedia, `
        + `${datos.tarifa.reparto.base}% base${datos.tarifa.division
          ? `, división ${datos.tarifa.division}` : ""}). `
        + `Los cargos de capacidad y distribución se aplican aparte, sobre la demanda facturable.`
      : "Falta capturar los cargos de energía de la tarifa: sin ellos el costo "
        + "de electricidad de la proyección es cero, que no es un dato sino un hueco.");

    // Proyección
    const serie = proyectar({
      ctrl: f.ctrl, opex: f.opex, variables: f.variables,
      escenario: escSel, tarifa: datos.tarifa, memInicial: datos.memInicial,
      generacion: datos.generacion, potDiseno: datos.potDiseno,
      meses: Math.max(12, (f.ctrl.horizonte || 10) * 12),
    });
    ultimaSerie = serie;
    $("#f_proy_esc").value = String(f.ctrl.escenario || 2);
    const g = pintaProyeccion(datos, f, serie, escSel);

    // Resumen
    texto("#fin_capex", pesos(datos.capex));
    texto("#fin_capex_x", datos.clase || "");
    texto("#fin_anio_res", anioSel != null ? String(anioSel) : "");
    texto("#fin_ventas", pesos(g.ventas));
    texto("#fin_ventas_x", `${ent(g.kwhMes)} kWh vendidos en ${g.meses} `
      + `${g.meses === 1 ? "mes" : "meses"}`);
    texto("#fin_ebitda", pesos(g.ebitda));
    texto("#fin_margen", g.ventas > 0 ? pct(g.margen) : "");
    texto("#fin_ebitda_x", "Antes de intereses, impuestos y depreciación");
    texto("#fin_costoluz", pesos(g.costoElectricidad));
    texto("#fin_costoluz_x", `Energía ${pesos(g.costoEnergia)} · demanda y fijos ${pesos(g.cargosDemanda)}`);
    texto("#fin_opexfijo", pesos(g.opexFijo));
    texto("#fin_var", pesos(g.costoVariable));
    texto("#fin_var_x", `${dec(v.pctTotal, 2)}% de las ventas`);
    texto("#fin_franquicia", pesos(g.costoFranquicia));
    texto("#fin_franquicia_x", f.ctrl.franquiciaActiva
      ? `${dec(f.ctrl.franquiciaPct, 2)}% de las ventas brutas` : "No aplicada");
    texto("#fin_opex_mes", pesos(o.mensual));
    texto("#fin_opex_mes_x", o.activos
      ? `${o.activos} concepto${o.activos === 1 ? "" : "s"} activo${o.activos === 1 ? "" : "s"}`
      : "Sin conceptos capturados");
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

    $("#fin_capex_desglose").innerHTML = datos.desglose.map((x) => `
      <div class="derived"><span class="muted">${esc(x.rotulo)}</span>
        <b>${pesos(x.valor)}</b></div>`).join("");

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
    const firma = f.opex.map((r) => `${r.id}:${r.inc?.modo || "ipc"}`).join("|");
    if (firma !== firmaOpex) { firmaOpex = firma; filasOpex(f.opex, ipc); }
    sincroniza("#fin_opex_body", f.opex);
    $$("#fin_opex_body tr").forEach((tr) => {
      const r = f.opex.find((x) => x.id === tr.dataset.id);
      const c = tr.querySelector("[data-tasaTxt]");
      if (r && c) c.textContent = r.activo === false ? "—" : pctDir(tasaEfectiva(r, ipc));
      tr.style.opacity = r && r.activo === false ? ".45" : "";
    });
    texto("#fin_opex_tot_mes", pesos(o.mensual));
    texto("#fin_opex_tot_anio", pesos(o.anual));
    texto("#fin_opex_ipc", pctDir(ipc));
    $("#fin_opex_vacio").classList.toggle("hide", f.opex.length > 0);

    // Costos variables
    const firmaV = f.variables.map((r) => r.id).join("|");
    if (firmaV !== firmaVar) { firmaVar = firmaV; filasVar(f.variables); }
    sincroniza("#fin_var_body", f.variables);
    $$("#fin_var_body tr").forEach((tr) => {
      const r = f.variables.find((x) => x.id === tr.dataset.id);
      tr.style.opacity = r && r.activo === false ? ".45" : "";
    });
    texto("#fin_var_tot", `${dec(v.pctTotal, 2)}%`);
    $("#fin_var_vacio").classList.toggle("hide", f.variables.length > 0);

    // Inversionistas
    const firmaI = f.inversionistas.map((r) => r.id).join("|");
    if (firmaI !== firmaInv) { firmaInv = firmaI; filasInv(f.inversionistas); }
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

    // Vista de inversionista: del snapshot, nunca del estado completo.
    if (panel === "vista") {
      snapVivo = snapshotInversionista({
        nombre: datos.nombre, ubicacion: datos.ubicacion,
        capexTotal: datos.capex, deposito: datos.deposito,
        clase: datos.clase, precision: datos.precision,
        opex: o, fondeo: inv, participantes: inv.participantes,
        operacion: resumenPorAnioOperacion(serie),
        notas: f.notas || "",
        version: datos.version, fecha: new Date(),
        demo: enDemo || !!f.demo,
      });
      pintaPublicacion(datos, f, snapVivo, enDemo);
    }
  }

  aplicaPanel();
  return { pintar, mostrarPanel: (p) => { panel = p; aplicaPanel(); if (ultimo) pintar(ultimo); } };
}
