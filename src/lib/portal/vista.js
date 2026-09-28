/* El marcado del portal de inversionistas (issue #9).
   ===================================================

   SÓLO LECTURA, Y NO POR ESTILO
   -----------------------------
   Este módulo devuelve marcado sin un solo `input`, `select`, `button`,
   `textarea` ni `contenteditable`. Hay pruebas que lo comprueban sobre el HTML
   que sale de aquí y sobre el DOM ya pintado. Los únicos controles de la
   página —la navegación y el selector de versión— los pone la página, no este
   módulo, y no escriben nada.

   SE CONSTRUYE DEL MODELO, NO DEL PROYECTO
   ----------------------------------------
   Recibe lo que `modeloPortal()` dejó pasar. Lo que no esté en el modelo no se
   puede pintar aunque se quiera, que es el punto de tener un modelo.

   DOS ESTADOS
   -----------
   Sin publicación financiera se enseñan proyecto, inversión y resumen técnico,
   y se dice que la proyección está pendiente. **No se pintan ceros**: un cero
   se lee como resultado y aquí sería un hueco. Con publicación se enseña la
   versión congelada tal cual.
*/

const esc = (s) => String(s ?? "").replace(/[<>&"]/g,
  (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString("es-MX")}`;
const pct = (x) => `${(Number(x || 0) * 100).toFixed(2)}%`;
const ent = (n) => Math.round(Number(n) || 0).toLocaleString("es-MX");
const dec = (n, d = 1) => (Number(n) || 0).toLocaleString("es-MX",
  { minimumFractionDigits: d, maximumFractionDigits: d });

/* Una cifra grande con su rótulo. `valor` ya viene formateado: este módulo no
   decide unidades. */
const cifra = (rotulo, valor, pie = "", destacada = false) => `
  <div class="cifra">
    <div class="rotulo">${esc(rotulo)}</div>
    <div class="valor${destacada ? " destacada" : ""}">${esc(valor)}</div>
    ${pie ? `<div class="pie">${esc(pie)}</div>` : ""}
  </div>`;

const dato = (rotulo, valor) => (valor == null || valor === ""
  ? ""
  : `<div class="dato"><span>${esc(rotulo)}</span><b>${esc(valor)}</b></div>`);

/* --- secciones ------------------------------------------------------------ */

function resumenHTML(m) {
  const t = m.tecnico;
  const hayInversion = m.inversion.total != null;
  const dem = t.demandaContratada;
  return `
  <div class="cifras">
    ${cifra("Inversión total", hayInversion ? pesos(m.inversion.total) : "Pendiente",
    hayInversion ? (m.inversion.clase || "") : "El proyecto todavía no guarda su cifra de inversión",
    true)}
    ${cifra("Capacidad instalada de carga", `${ent(t.potenciaInstalada)} kW`,
    t.balanceo.activo
      ? `Demanda de diseño ${ent(t.potenciaDiseno)} kW con ${dec(t.balanceo.pct, 0)}% reservado al balanceo`
      : "Sin balanceo dinámico declarado")}
    ${cifra("Equipos de carga", `${ent(t.equipos)}`,
    `${ent(t.puntos)} ${t.puntos === 1 ? "punto de carga" : "puntos de carga"}`)}
  </div>
  <div class="cifras">
    ${t.transformador.kva
    ? cifra("Transformador", `${ent(t.transformador.kva)} kVA`,
      t.transformador.primaria && t.transformador.secundaria
        ? `${dec(t.transformador.primaria, 0)} kV / ${ent(t.transformador.secundaria)} V` : "")
    : ""}
    ${dem.kw != null
    ? cifra("Demanda contratada", `${ent(dem.kw)} kW`,
      dem.declarada ? "Declarada en el proyecto"
        : "Piso de tarifa: 60% de la carga conectada, mínimo 100 kW")
    : ""}
    ${t.generacion.kwp > 0
    ? cifra("Generación fotovoltaica", `${ent(t.generacion.kwp)} kWp`,
      t.generacion.rendimiento ? `${ent(t.generacion.rendimiento)} kWh/kWp al mes` : "")
    : cifra("Generación fotovoltaica", "No incluida")}
  </div>
  ${estadoFinancieroHTML(m)}${resumenFinancieroHTML(m)}`;
}

function resumenFinancieroHTML(m) {
  const a1 = m.finanzas?.snapshot?.operacion?.[0];
  if (!a1) return "";
  return `<div class="cifras">
    ${cifra("Ventas — Año 1", pesos(a1.ventas))}
    ${cifra("Costo de electricidad — Año 1", pesos(a1.costoEnergia),
      "Proyección preliminar · pendiente de validación de demanda y FV", true)}
    ${(a1.franquicia || 0) > 0 ? cifra("Franquicia — Año 1", pesos(a1.franquicia),
      `${(Number(a1.franquiciaPct || 0)).toFixed(2)}% de ventas brutas`) : ""}
    ${cifra("EBITDA — Año 1", pesos(a1.ebitda), `Margen ${pct(a1.margen)}`)}
  </div>`;
}

function estadoFinancieroHTML(m) {
  if (!m.finanzas) {
    return `<div class="aviso">
      <b>Proyección financiera pendiente de publicación.</b>
      Este proyecto todavía no tiene una versión publicada de su modelo de
      operación, así que el portal no muestra ventas, costos ni EBITDA. En
      cuanto se publique una, aparece aquí sin que haya que hacer nada más.
    </div>`;
  }
  const f = m.finanzas;
  return `<div class="aviso ok">
    <b>Proyección financiera publicada.</b>
    Versión del ${esc(f.publicadoTxt || f.publicado)}${f.etiqueta
  ? ` · ${esc(f.etiqueta)}` : ""}. Las cifras están congeladas: son las que se
    publicaron ese día y no cambian aunque el proyecto haya cambiado desde
    entonces.
  </div>`;
}

function proyectoHTML(m) {
  const t = m.tecnico;
  const s = t.suministro;
  const MODOS = {
    epc: "EPC para tercero", propia: "Estación propia",
    coinv: "Inversión compartida", concesion: "Concesión en predio de tercero",
    caas: "Infraestructura como servicio",
    llave: "Llave en mano con operación por Beyond",
  };
  return `
  <div class="cols">
    <div class="bloque">
      <h3>Infraestructura de carga</h3>
      ${dato("Equipos de carga", ent(t.equipos))}
      ${dato("Puntos de carga", ent(t.puntos))}
      ${dato("Potencia instalada", `${ent(t.potenciaInstalada)} kW`)}
      ${dato("Demanda de diseño", `${ent(t.potenciaDiseno)} kW`)}
      ${t.balanceo.activo
    ? dato("Reserva de balanceo", `${dec(t.balanceo.pct, 0)}%`)
    : dato("Balanceo dinámico", "No declarado")}
      ${t.almacenamiento.modulos > 0
    ? dato("Almacenamiento", `${ent(t.almacenamiento.modulos)} módulos · ${ent(t.almacenamiento.kwh)} kWh · ${ent(t.almacenamiento.kw)} kW`)
    : dato("Almacenamiento", "No incluido")}
    </div>
    <div class="bloque">
      <h3>Conexión y suministro</h3>
      ${t.transformador.kva ? dato("Transformador", `${ent(t.transformador.kva)} kVA`) : ""}
      ${t.transformador.primaria ? dato("Tensión primaria", `${dec(t.transformador.primaria, 0)} kV`) : ""}
      ${t.transformador.secundaria ? dato("Tensión secundaria", `${ent(t.transformador.secundaria)} V`) : ""}
      ${t.demandaContratada.kw != null
    ? dato("Demanda contratada", `${ent(t.demandaContratada.kw)} kW${
      t.demandaContratada.declarada ? "" : " (piso de tarifa)"}`) : ""}
      ${dato("Suministrador", s.suministrador || "Por definir")}
      ${dato("Tarifa", [s.categoria, s.division, s.mes].filter(Boolean).join(" · ") || "Por declarar")}
      ${s.mercadoMayorista ? dato("Suministro", "Calificado en el mercado mayorista") : ""}
      ${dato("Modelo de negocio", MODOS[t.modelo] || "")}
    </div>
  </div>
  <div class="cols">
    <div class="bloque">
      <h3>Inversión</h3>
      ${m.inversion.directo != null ? dato("Costo directo de obra y equipo", pesos(m.inversion.directo)) : ""}
      ${m.inversion.total != null ? dato("Inversión total", pesos(m.inversion.total)) : ""}
      ${m.inversion.clase ? dato("Nivel de definición", m.inversion.clase) : ""}
      ${m.inversion.indice != null ? dato("Índice de definición", dec(m.inversion.indice, 2)) : ""}
      <div class="nota">
        Estimado paramétrico, no precio cerrado. Las cantidades se derivan de
        las variables de sitio mediante reglas paramétricas, no de ingeniería
        de detalle.
      </div>
    </div>
  </div>`;
}

function proyeccionHTML(m) {
  if (!m.finanzas) return "";
  const op = m.finanzas.snapshot?.operacion || [];
  if (!op.length) {
    return `<div class="aviso">La versión publicada no incluye proyección anual.</div>`;
  }
  return `
  <div class="tabla-envoltura">
    <table>
      <thead><tr><th>Año</th><th class="num">Ventas</th>
        <th class="num">Costo de electricidad</th><th class="num">Franquicia</th><th class="num">Operación</th>
        <th class="num">EBITDA</th><th class="num">Margen</th></tr></thead>
      <tbody>${op.map((a) => `<tr>
        <td>${esc(a.anio)}</td>
        <td class="num">${pesos(a.ventas)}</td>
        <td class="num">${pesos(a.costoEnergia)}</td>
        <td class="num">${pesos(a.franquicia || 0)}</td>
        <td class="num">${pesos(a.opex)}</td>
        <td class="num fuerte">${pesos(a.ebitda)}</td>
        <td class="num">${pct(a.margen)}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>
  <div class="nota">
    EBITDA antes de intereses, impuestos y depreciación, sobre supuestos de
    operación capturados para este proyecto. No hay ingresos históricos: es una
    proyección, no un resultado. No incluye retorno, deuda ni financiamiento.
  </div>`;
}

function inversionistasHTML(m) {
  if (!m.finanzas) return "";
  const s = m.finanzas.snapshot || {};
  const lista = s.inversionistas || [];
  const fondeo = s.fondeo || {};
  const sumaA = lista.reduce((a, p) => a + (Number(p.aportacion) || 0), 0);
  const sumaP = lista.reduce((a, p) => a + (Number(p.participacion) || 0), 0);
  return `
  <div class="cifras">
    ${cifra("Capital aportado", pesos(fondeo.aportado),
    `${lista.length} ${lista.length === 1 ? "participante" : "participantes"}`)}
    ${fondeo.faltante > 0
    ? cifra("Falta por fondear", pesos(fondeo.faltante),
      `Cubierto ${pct(fondeo.cobertura)} de la inversión total`, true)
    : cifra("Fondeo", fondeo.excedente > 0 ? `+${pesos(fondeo.excedente)}` : "Completo",
      fondeo.excedente > 0 ? "El capital aportado supera la inversión total"
        : "El capital aportado cubre la inversión total")}
    ${cifra("Inversión requerida", pesos(fondeo.requerido))}
  </div>
  <div class="tabla-envoltura">
    <table>
      <thead><tr><th>Inversionista</th><th class="num">Aportación</th>
        <th class="num">Participación</th></tr></thead>
      <tbody>
        ${lista.length
    ? lista.map((p) => `<tr><td>${esc(p.nombre)}</td>
            <td class="num">${pesos(p.aportacion)}</td>
            <td class="num">${pct(p.participacion)}</td></tr>`).join("")
    : `<tr><td colspan="3">Sin inversionistas capturados.</td></tr>`}
        <tr class="total"><td>Total</td>
          <td class="num">${pesos(sumaA)}</td>
          <td class="num">${pct(sumaP)}</td></tr>
      </tbody>
    </table>
  </div>
  <div class="nota">
    La participación es la proporción del capital aportado. No es una tabla
    accionaria: la estructura societaria la define el acta constitutiva y el
    acuerdo de socios.
  </div>
  ${s.notas ? `<div class="bloque" style="margin-top:22px">
    <h3>Notas y supuestos</h3>
    <div class="texto">${esc(s.notas)}</div></div>` : ""}`;
}

/* --- la página ------------------------------------------------------------ */

export const SECCIONES = [
  { id: "resumen", nombre: "Resumen", siempre: true },
  { id: "proyecto", nombre: "Proyecto", siempre: true },
  { id: "proyeccion", nombre: "Proyección", siempre: false },
  { id: "inversionistas", nombre: "Inversionistas", siempre: false },
];

/* Las secciones que tiene sentido enseñar. Sin publicación financiera,
   Proyección e Inversionistas no existen: una pestaña que abre en blanco es
   peor que una pestaña que no está. */
export function seccionesVisibles(m) {
  return SECCIONES.filter((s) => s.siempre || !!(m && m.finanzas));
}

export function portalHTML(m) {
  if (!m) return "";
  return `
  <header class="cabecera">
    <div>
      <div class="marca" role="img" aria-label="Beyond"></div>
      <div class="sello">BEYOND AE · INFRAESTRUCTURA DE CARGA</div>
    </div>
    <div class="identidad">
      <h1>${esc(m.proyecto.nombre)}</h1>
      ${m.proyecto.ubicacion ? `<div class="lugar">${esc(m.proyecto.ubicacion)}</div>` : ""}
    </div>
  </header>
  <main>
    <section data-seccion="resumen">${resumenHTML(m)}</section>
    <section data-seccion="proyecto" hidden>${proyectoHTML(m)}</section>
    <section data-seccion="proyeccion" hidden>${proyeccionHTML(m)}</section>
    <section data-seccion="inversionistas" hidden>${inversionistasHTML(m)}</section>
  </main>
  <footer class="pie">
    <div>${esc(m.meta.generadoTxt)}${m.meta.version ? ` · ${esc(m.meta.version)}` : ""}</div>
    <div>Documento informativo. Las cifras provienen del estimado paramétrico
      del proyecto y no constituyen una oferta ni un precio cerrado.</div>
  </footer>`;
}
