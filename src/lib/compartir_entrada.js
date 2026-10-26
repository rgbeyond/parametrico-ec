// Entrada a «Compartir» de beyond core desde el estudio abierto (Compartir C2).
//
// SOLO NAVEGACIÓN. Un enlace en la fila del encabezado común hacia la página
// de Core /compartir/<pv|ev>/<id>, con el regreso a este estudio. No lee ni
// envía datos del estudio, cálculos ni costos: Core resuelve el estudio con la
// sesión de quien entra y el servidor decide si puede compartirlo. Fuera de
// Platform, o sin un id con forma de UUID, no hay enlace.
//
// Mismo archivo en Energía y en EV.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS = new Set(["pv", "ev"]);

// La URL de Core, o null. `volver` es la ruta actual de la app (ruta + query
// + hash); Core solo la usa si pasa su contrato y cae en /energia/ o /ec/.
export function urlCompartir(tipo, id, volver) {
  if (!TIPOS.has(tipo) || !UUID.test(String(id ?? ""))) return null;
  const base = `/compartir/${tipo}/${String(id).toLowerCase()}`;
  return typeof volver === "string" && volver.startsWith("/") ? `${base}?volver=${encodeURIComponent(volver)}` : base;
}

// Pone o quita el enlace en la fila del encabezado común. destino: { tipo, id }
// del estudio abierto, o null para quitarlo (portada, catálogo, otra ruta).
export function fijarCompartir(encabezado, destino, loc = globalThis.location) {
  const fila = encabezado?.barra?.querySelector(".bc-controles");
  if (!fila) return;
  const href = destino ? urlCompartir(destino.tipo, destino.id, loc ? loc.pathname + loc.search + loc.hash : null) : null;
  let a = fila.querySelector(".bc-compartir");
  if (!href) { a?.remove(); return; }
  if (!a) {
    a = fila.ownerDocument.createElement("a");
    a.className = "bc-compartir";
    // Ícono (trazos de Lucide «share-2», ISC) y texto: en angosto queda solo el
    // ícono, con el mismo nombre accesible (ver la hoja de estilos).
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg><span class="bc-compartir-texto">Compartir</span>';
    a.setAttribute("aria-label", "Compartir este estudio");
    a.title = "Compartir este estudio";
    fila.prepend(a);
  }
  a.href = href;
}
