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
    a.textContent = "Compartir";
    a.setAttribute("aria-label", "Compartir este estudio");
    fila.prepend(a);
  }
  a.href = href;
}
